using handwritingOCR.Server.Models;
using Npgsql;

namespace handwritingOCR.Server.Services
{
    // Сервис работы с таблицей words. Порядок слов на скане задаётся order_index:
    // нумерация плотная (0, 1, 2, ...) и уникальная в пределах скана, поэтому вставка,
    // удаление и перемещение слова сопровождаются сдвигом номеров соседей. Сдвиг одним
    // UPDATE ненадолго создаёт дубликаты номеров и работает только потому, что ограничение
    // unique_order объявлено в миграции как deferrable initially deferred.
    // Транзакции откатываются сами при выходе из метода, если не был вызван commit
    public class WordDbService
    {
        private const int OrderIndexOffset = 1_000_000;

        private readonly IConfiguration _configuration;

        public WordDbService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<IReadOnlyList<Word>> GetWordsByScanIdAsync(int scanId)
        {
            await using var connection = await OpenConnectionAsync();
            return await LoadWordsAsync(connection, null, scanId);
        }

        public async Task ReplaceWordsFromOcrAsync(int scanId, IReadOnlyList<Word> words)
        {
            // Результат распознавания полностью заменяет прежние слова скана:
            // повторный запуск OCR не должен смешивать новые слова со старыми
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            await using (var deleteCommand = new NpgsqlCommand(
                "DELETE FROM words WHERE scan_id = @scanId", connection, transaction))
            {
                deleteCommand.Parameters.AddWithValue("scanId", scanId);
                await deleteCommand.ExecuteNonQueryAsync();
            }

            foreach (var word in words)
            {
                // OrderIndex у слов из OCR уже расставлен по порядку обхода ответа API
                await using var insertCommand = new NpgsqlCommand(InsertQuery, connection, transaction);
                insertCommand.Parameters.AddWithValue("scanId", scanId);
                AddWordParameters(insertCommand, word, word.OrderIndex);
                await insertCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }

        // Вставляет слово в конец скана; позицию задаёт последующий ApplyLayoutAsync
        public async Task<Word> InsertWordAsync(int scanId, Word word)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var words = await LoadWordsAsync(connection, transaction, scanId);
            var orderIndex = words.Count;
            var lineIndex = words.Count > 0 ? words[^1].LineIndex : 0;

            word.LineIndex = lineIndex;
            await using var insertCommand = new NpgsqlCommand(
                InsertQuery + " RETURNING id", connection, transaction);
            insertCommand.Parameters.AddWithValue("scanId", scanId);
            AddWordParameters(insertCommand, word, orderIndex);
            var insertedId = (int)(await insertCommand.ExecuteScalarAsync())!;

            await transaction.CommitAsync();

            word.Id = insertedId;
            word.ScanId = scanId;
            word.OrderIndex = orderIndex;

            return word;
        }

        // Возвращает null, если слова с таким id нет или оно принадлежит другому скану
        public async Task<Word?> UpdateWordAsync(int scanId, int wordId, Word word)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var existing = (await LoadWordsAsync(connection, transaction, scanId))
                .FirstOrDefault(w => w.Id == wordId);
            if (existing == null)
            {
                return null;
            }

            existing.Text = word.Text;
            existing.X1 = word.X1;
            existing.Y1 = word.Y1;
            existing.X2 = word.X2;
            existing.Y2 = word.Y2;
            existing.X3 = word.X3;
            existing.Y3 = word.Y3;
            existing.X4 = word.X4;
            existing.Y4 = word.Y4;

            await UpdateWordContentAsync(connection, transaction, existing);
            await transaction.CommitAsync();

            return existing;
        }

        // Пересчитывает order_index и line_index по раскладке от клиента
        public async Task<IReadOnlyList<Word>> ApplyLayoutAsync(int scanId, WordLayoutRequest request)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var words = await LoadWordsAsync(connection, transaction, scanId);
            var lines = BuildLinesFromRequest(words, request);

            RebuildIndices(lines);
            await PersistIndicesAsync(connection, transaction, scanId, FlattenLines(lines));

            await transaction.CommitAsync();

            return await LoadWordsAsync(connection, null, scanId);
        }

        // Нумерация уплотняется, чтобы в порядке чтения не появилось пропусков.
        // Возвращает false, если слова с таким id нет или оно принадлежит другому скану
        public async Task<bool> DeleteWordAsync(int scanId, int wordId)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var words = await LoadWordsAsync(connection, transaction, scanId);
            if (words.All(w => w.Id != wordId))
            {
                return false;
            }

            await using (var deleteCommand = new NpgsqlCommand(
                "DELETE FROM words WHERE id = @wordId AND scan_id = @scanId", connection, transaction))
            {
                deleteCommand.Parameters.AddWithValue("wordId", wordId);
                deleteCommand.Parameters.AddWithValue("scanId", scanId);
                await deleteCommand.ExecuteNonQueryAsync();
            }

            var remaining = words.Where(w => w.Id != wordId).ToList();
            if (remaining.Count > 0)
            {
                var lines = GroupWordsByLine(remaining);
                RebuildIndices(lines);
                await PersistIndicesAsync(connection, transaction, scanId, FlattenLines(lines));
            }

            await transaction.CommitAsync();
            return true;
        }

        private static List<List<Word>> BuildLinesFromRequest(
            IReadOnlyList<Word> words,
            WordLayoutRequest request)
        {
            var wordById = words.ToDictionary(w => w.Id);
            var idsInRequest = request.Lines.Where(line => line.Count > 0).SelectMany(line => line).ToList();

            if (idsInRequest.Count != words.Count)
            {
                throw new ArgumentException("Раскладка должна содержать каждое слово скана ровно один раз.");
            }

            if (idsInRequest.Distinct().Count() != idsInRequest.Count)
            {
                throw new ArgumentException("В раскладке не должно быть повторяющихся id слов.");
            }

            var lines = new List<List<Word>>();
            foreach (var lineIds in request.Lines)
            {
                if (lineIds.Count == 0)
                {
                    continue;
                }

                var line = new List<Word>();
                foreach (var wordId in lineIds)
                {
                    if (!wordById.TryGetValue(wordId, out var word))
                    {
                        throw new ArgumentException("Слово id=" + wordId + " не принадлежит этому скану.");
                    }

                    line.Add(word);
                }

                lines.Add(line);
            }

            if (lines.Count == 0 && words.Count > 0)
            {
                throw new ArgumentException("Раскладка не может быть пустой.");
            }

            return lines;
        }

        private static List<List<Word>> GroupWordsByLine(IReadOnlyList<Word> words)
        {
            var byLine = new SortedDictionary<int, List<Word>>();

            foreach (var word in words)
            {
                if (!byLine.TryGetValue(word.LineIndex, out var line))
                {
                    line = new List<Word>();
                    byLine[word.LineIndex] = line;
                }

                line.Add(word);
            }

            return byLine.Values
                .Select(line => line.OrderBy(w => w.OrderIndex).ToList())
                .ToList();
        }

        private static void RebuildIndices(List<List<Word>> lines)
        {
            var globalOrder = 0;

            for (var lineIndex = 0; lineIndex < lines.Count; lineIndex++)
            {
                foreach (var word in lines[lineIndex])
                {
                    word.LineIndex = lineIndex;
                    word.OrderIndex = globalOrder++;
                }
            }
        }

        private static List<Word> FlattenLines(List<List<Word>> lines)
        {
            return lines.SelectMany(line => line).ToList();
        }

        private static async Task PersistIndicesAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            int scanId,
            IReadOnlyList<Word> words)
        {
            // Сначала сдвигаем все order_index на offset, чтобы при записи новых значений
            // не нарушить unique_order (ограничение deferrable initially deferred)
            await using (var tempCommand = new NpgsqlCommand(
                """
                UPDATE words
                SET order_index = order_index + @offset
                WHERE scan_id = @scanId
                """,
                connection,
                transaction))
            {
                tempCommand.Parameters.AddWithValue("offset", OrderIndexOffset);
                tempCommand.Parameters.AddWithValue("scanId", scanId);
                await tempCommand.ExecuteNonQueryAsync();
            }

            const string updateQuery = """
                UPDATE words
                SET order_index = @orderIndex,
                    line_index = @lineIndex
                WHERE id = @wordId AND scan_id = @scanId
                """;

            foreach (var word in words)
            {
                await using var updateCommand = new NpgsqlCommand(updateQuery, connection, transaction);
                updateCommand.Parameters.AddWithValue("wordId", word.Id);
                updateCommand.Parameters.AddWithValue("scanId", scanId);
                updateCommand.Parameters.AddWithValue("orderIndex", word.OrderIndex);
                updateCommand.Parameters.AddWithValue("lineIndex", word.LineIndex);
                await updateCommand.ExecuteNonQueryAsync();
            }
        }

        private static async Task UpdateWordContentAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            Word word)
        {
            const string updateQuery = """
                UPDATE words
                SET word = @word,
                    x1 = @x1, y1 = @y1,
                    x2 = @x2, y2 = @y2,
                    x3 = @x3, y3 = @y3,
                    x4 = @x4, y4 = @y4
                WHERE id = @wordId AND scan_id = @scanId
                """;

            await using var updateCommand = new NpgsqlCommand(updateQuery, connection, transaction);
            updateCommand.Parameters.AddWithValue("wordId", word.Id);
            updateCommand.Parameters.AddWithValue("scanId", word.ScanId);
            updateCommand.Parameters.AddWithValue("word", word.Text);
            updateCommand.Parameters.AddWithValue("x1", word.X1);
            updateCommand.Parameters.AddWithValue("y1", word.Y1);
            updateCommand.Parameters.AddWithValue("x2", word.X2);
            updateCommand.Parameters.AddWithValue("y2", word.Y2);
            updateCommand.Parameters.AddWithValue("x3", word.X3);
            updateCommand.Parameters.AddWithValue("y3", word.Y3);
            updateCommand.Parameters.AddWithValue("x4", word.X4);
            updateCommand.Parameters.AddWithValue("y4", word.Y4);
            await updateCommand.ExecuteNonQueryAsync();
        }

        private static async Task<List<Word>> LoadWordsAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction? transaction,
            int scanId)
        {
            const string query = """
                SELECT id, scan_id, word, x1, y1, x2, y2, x3, y3, x4, y4, order_index, line_index
                FROM words
                WHERE scan_id = @scanId
                ORDER BY order_index
                """;

            await using var command = new NpgsqlCommand(query, connection, transaction);
            command.Parameters.AddWithValue("scanId", scanId);

            var words = new List<Word>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                words.Add(ReadWord(reader));
            }

            return words;
        }

        // Каждый метод открывает своё соединение: Npgsql держит пул, поэтому это не создаёт
        // новое подключение к серверу, зато соединение и транзакция не переживают вызов
        private async Task<NpgsqlConnection> OpenConnectionAsync()
        {
            var connectionString = _configuration.GetConnectionString("Default");
            var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            return connection;
        }

        private const string InsertQuery = """
            INSERT INTO words (scan_id, word, x1, y1, x2, y2, x3, y3, x4, y4, order_index, line_index)
            VALUES (@scanId, @word, @x1, @y1, @x2, @y2, @x3, @y3, @x4, @y4, @orderIndex, @lineIndex)
            """;

        // Порядок столбцов совпадает с select в GetWordsByScanIdAsync
        private static Word ReadWord(NpgsqlDataReader reader)
        {
            return new Word
            {
                Id = reader.GetInt32(0),
                ScanId = reader.GetInt32(1),
                Text = reader.GetString(2),
                X1 = reader.GetFloat(3),
                Y1 = reader.GetFloat(4),
                X2 = reader.GetFloat(5),
                Y2 = reader.GetFloat(6),
                X3 = reader.GetFloat(7),
                Y3 = reader.GetFloat(8),
                X4 = reader.GetFloat(9),
                Y4 = reader.GetFloat(10),
                OrderIndex = reader.GetInt32(11),
                LineIndex = reader.GetInt32(12),
            };
        }

        // orderIndex передаётся отдельно от модели: при вставке в конец это words.Count,
        // у слова из OCR — значение, расставленное при разборе ответа
        private static void AddWordParameters(NpgsqlCommand command, Word word, int orderIndex)
        {
            command.Parameters.AddWithValue("word", word.Text);
            command.Parameters.AddWithValue("x1", word.X1);
            command.Parameters.AddWithValue("y1", word.Y1);
            command.Parameters.AddWithValue("x2", word.X2);
            command.Parameters.AddWithValue("y2", word.Y2);
            command.Parameters.AddWithValue("x3", word.X3);
            command.Parameters.AddWithValue("y3", word.Y3);
            command.Parameters.AddWithValue("x4", word.X4);
            command.Parameters.AddWithValue("y4", word.Y4);
            command.Parameters.AddWithValue("orderIndex", orderIndex);
            command.Parameters.AddWithValue("lineIndex", word.LineIndex);
        }
    }
}
