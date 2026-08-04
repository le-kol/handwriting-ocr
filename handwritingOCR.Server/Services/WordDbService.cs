using handwritingOCR.Server.Models;
using Npgsql;

namespace handwritingOCR.Server.Services
{
    // Сервис работы с таблицей words. Порядок слов на скане задаётся order_index:
    // нумерация плотная (0, 1, 2, ...) и уникальная в пределах скана, поэтому вставка,
    // удаление и перемещение слова сопровождаются сдвигом номеров соседей.
    // Транзакции откатываются сами при выходе из метода, если не был вызван commit
    public class WordDbService
    {
        private readonly IConfiguration _configuration;

        public WordDbService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public async Task<IReadOnlyList<Word>> GetWordsByScanIdAsync(int scanId)
        {
            await using var connection = await OpenConnectionAsync();

            const string query = """
                SELECT id, scan_id, word, x1, y1, x2, y2, x3, y3, x4, y4, order_index
                FROM words
                WHERE scan_id = @scanId
                ORDER BY order_index
                """;

            await using var command = new NpgsqlCommand(query, connection);
            command.Parameters.AddWithValue("scanId", scanId);

            var words = new List<Word>();
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                words.Add(ReadWord(reader));
            }

            return words;
        }

        // Результат распознавания полностью заменяет прежние слова скана:
        // повторный запуск OCR не должен смешивать новые слова со старыми
        public async Task ReplaceWordsFromOcrAsync(int scanId, IReadOnlyList<Word> words)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            await using (var deleteCommand = new NpgsqlCommand(
                "DELETE FROM words WHERE scan_id = @scanId", connection, transaction))
            {
                deleteCommand.Parameters.AddWithValue("scanId", scanId);
                await deleteCommand.ExecuteNonQueryAsync();
            }

            // OrderIndex у слов из OCR уже расставлен по порядку обхода ответа API
            foreach (var word in words)
            {
                await using var insertCommand = new NpgsqlCommand(InsertQuery, connection, transaction);
                insertCommand.Parameters.AddWithValue("scanId", scanId);
                AddWordParameters(insertCommand, word, word.OrderIndex);
                await insertCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
        }

        public async Task<Word> InsertAtAsync(int scanId, int orderIndex, Word word)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            // Позиция за пределами нумерации означает вставку в конец
            var wordCount = await GetWordCountAsync(connection, transaction, scanId);
            var targetIndex = Math.Clamp(orderIndex, 0, wordCount);

            await using (var shiftCommand = new NpgsqlCommand(
                """
                UPDATE words
                SET order_index = order_index + 1
                WHERE scan_id = @scanId AND order_index >= @orderIndex
                """,
                connection,
                transaction))
            {
                shiftCommand.Parameters.AddWithValue("scanId", scanId);
                shiftCommand.Parameters.AddWithValue("orderIndex", targetIndex);
                await shiftCommand.ExecuteNonQueryAsync();
            }

            await using var insertCommand = new NpgsqlCommand(
                InsertQuery + " RETURNING id", connection, transaction);
            insertCommand.Parameters.AddWithValue("scanId", scanId);
            AddWordParameters(insertCommand, word, targetIndex);
            var insertedId = (int)(await insertCommand.ExecuteScalarAsync())!;

            await transaction.CommitAsync();

            return FillServerFields(word, insertedId, scanId, targetIndex);
        }

        // Возвращает null, если слова с таким id нет или оно принадлежит другому скану
        public async Task<Word?> UpdateWordAsync(int scanId, int wordId, Word word)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var currentIndex = await GetWordOrderIndexAsync(connection, transaction, scanId, wordId);
            if (currentIndex == null)
            {
                return null;
            }

            // Слово не может встать за пределы существующей нумерации 0..count-1
            var wordCount = await GetWordCountAsync(connection, transaction, scanId);
            var targetIndex = Math.Clamp(word.OrderIndex, 0, wordCount - 1);

            if (targetIndex != currentIndex.Value)
            {
                await ShiftForMoveAsync(connection, transaction, scanId, currentIndex.Value, targetIndex);
            }

            const string updateQuery = """
                UPDATE words
                SET word = @word,
                    x1 = @x1, y1 = @y1,
                    x2 = @x2, y2 = @y2,
                    x3 = @x3, y3 = @y3,
                    x4 = @x4, y4 = @y4,
                    order_index = @orderIndex
                WHERE id = @wordId
                """;

            await using var updateCommand = new NpgsqlCommand(updateQuery, connection, transaction);
            AddWordParameters(updateCommand, word, targetIndex);
            updateCommand.Parameters.AddWithValue("wordId", wordId);
            await updateCommand.ExecuteNonQueryAsync();

            await transaction.CommitAsync();

            return FillServerFields(word, wordId, scanId, targetIndex);
        }

        // Нумерация уплотняется, чтобы в порядке чтения не появилось пропусков.
        // Возвращает false, если слова с таким id нет или оно принадлежит другому скану
        public async Task<bool> DeleteWordAsync(int scanId, int wordId)
        {
            await using var connection = await OpenConnectionAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            var orderIndex = await GetWordOrderIndexAsync(connection, transaction, scanId, wordId);
            if (orderIndex == null)
            {
                return false;
            }

            await using (var deleteCommand = new NpgsqlCommand(
                "DELETE FROM words WHERE id = @wordId", connection, transaction))
            {
                deleteCommand.Parameters.AddWithValue("wordId", wordId);
                await deleteCommand.ExecuteNonQueryAsync();
            }

            await using (var shiftCommand = new NpgsqlCommand(
                """
                UPDATE words
                SET order_index = order_index - 1
                WHERE scan_id = @scanId AND order_index > @orderIndex
                """,
                connection,
                transaction))
            {
                shiftCommand.Parameters.AddWithValue("scanId", scanId);
                shiftCommand.Parameters.AddWithValue("orderIndex", orderIndex.Value);
                await shiftCommand.ExecuteNonQueryAsync();
            }

            await transaction.CommitAsync();
            return true;
        }

        // Освобождает целевую позицию, сдвигая слова между старой и новой позицией на единицу.
        // Само перемещаемое слово в диапазон не попадает — его позиция меняется отдельным UPDATE
        private static async Task ShiftForMoveAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            int scanId,
            int currentIndex,
            int targetIndex)
        {
            var query = targetIndex < currentIndex
                // Слово двигают к началу: слова на участке [target, current) уступают место,
                // их номера увеличиваются на единицу
                ? """
                  UPDATE words
                  SET order_index = order_index + 1
                  WHERE scan_id = @scanId AND order_index >= @targetIndex AND order_index < @currentIndex
                  """
                // Слово двигают к концу: слова на участке (current, target] занимают
                // освободившиеся места, их номера уменьшаются на единицу
                : """
                  UPDATE words
                  SET order_index = order_index - 1
                  WHERE scan_id = @scanId AND order_index > @currentIndex AND order_index <= @targetIndex
                  """;

            await using var command = new NpgsqlCommand(query, connection, transaction);
            command.Parameters.AddWithValue("scanId", scanId);
            command.Parameters.AddWithValue("currentIndex", currentIndex);
            command.Parameters.AddWithValue("targetIndex", targetIndex);
            await command.ExecuteNonQueryAsync();
        }

        // Условие по scan_id заодно проверяет, что слово принадлежит указанному скану:
        // для слова из другого скана позиция не найдётся
        private static async Task<int?> GetWordOrderIndexAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            int scanId,
            int wordId)
        {
            await using var command = new NpgsqlCommand(
                "SELECT order_index FROM words WHERE id = @wordId AND scan_id = @scanId",
                connection,
                transaction);
            command.Parameters.AddWithValue("wordId", wordId);
            command.Parameters.AddWithValue("scanId", scanId);

            var orderIndex = await command.ExecuteScalarAsync();

            return orderIndex == null ? null : (int)orderIndex;
        }

        private static async Task<int> GetWordCountAsync(
            NpgsqlConnection connection,
            NpgsqlTransaction transaction,
            int scanId)
        {
            await using var command = new NpgsqlCommand(
                "SELECT COUNT(*) FROM words WHERE scan_id = @scanId", connection, transaction);
            command.Parameters.AddWithValue("scanId", scanId);

            // COUNT возвращает bigint, поэтому приведение к int напрямую не сработает
            return Convert.ToInt32(await command.ExecuteScalarAsync());
        }

        private async Task<NpgsqlConnection> OpenConnectionAsync()
        {
            var connectionString = _configuration.GetConnectionString("Default");
            var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            return connection;
        }

        private const string InsertQuery = """
            INSERT INTO words (scan_id, word, x1, y1, x2, y2, x3, y3, x4, y4, order_index)
            VALUES (@scanId, @word, @x1, @y1, @x2, @y2, @x3, @y3, @x4, @y4, @orderIndex)
            """;

        // Поля, которые задаёт сервер, а не клиент: id, скан и итоговая позиция слова
        private static Word FillServerFields(Word word, int id, int scanId, int orderIndex)
        {
            word.Id = id;
            word.ScanId = scanId;
            word.OrderIndex = orderIndex;

            return word;
        }

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
            };
        }

        // orderIndex передаётся отдельно от модели: значение из тела запроса может быть
        // скорректировано, а у слова из OCR оно выставляется при разборе ответа
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
        }
    }
}
