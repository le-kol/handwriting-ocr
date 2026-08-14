using handwritingOCR.Server.Models;
using Npgsql;

namespace handwritingOCR.Server.Services
{
    public class ScanDbService
    {
        private readonly IConfiguration _configuration;

        public ScanDbService(IConfiguration configuration)
        {
            _configuration = configuration;
        }
        // метод для вставки новых изображений в БД, возвращает id вставленной строки
        public async Task<int> InsertScanAsync(string path)
        {
            var connectionString = _configuration.GetConnectionString("Default");
            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();
                const string insertQuery = "INSERT INTO scans (path) VALUES (@p) RETURNING id";

                await using (var command = new NpgsqlCommand(insertQuery, connection))
                {
                    command.Parameters.AddWithValue("p", path);
                    // RETURNING всегда отдаёт строку для успешной вставки, null тут невозможен
                    var insertedId = (int)(await command.ExecuteScalarAsync())!;

                    return insertedId;
                }
            }
        }
        // метод для получения пути до изображений с сервера по id
        public async Task<string?> GetScanPathAsync(int id)
        {
            var connectionString = _configuration.GetConnectionString("Default");
            await using (var connection = new NpgsqlConnection(connectionString))
            {
                await connection.OpenAsync();
                const string selectQuery = "SELECT path FROM scans WHERE id=@id";

                await using (var command = new NpgsqlCommand(selectQuery, connection))
                {
                    command.Parameters.AddWithValue("id", id);
                    //Вернется null в случае, если строка не найдена в таблице
                    var filePath = await command.ExecuteScalarAsync();

                    return (string?)filePath;
                }
            }
        }

        public async Task<ScanListPage> GetScansPageAsync(int page, int pageSize)
        {
            var connectionString = _configuration.GetConnectionString("Default");
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();

            int totalCount;
            await using (var countCommand = new NpgsqlCommand("SELECT COUNT(*)::int FROM scans", connection))
            {
                totalCount = (int)(await countCommand.ExecuteScalarAsync())!;
            }

            var items = new List<ScanListItem>();
            var offset = (page - 1) * pageSize;
            await using (var selectCommand = new NpgsqlCommand(
                "SELECT id FROM scans ORDER BY id DESC LIMIT @limit OFFSET @offset",
                connection))
            {
                selectCommand.Parameters.AddWithValue("limit", pageSize);
                selectCommand.Parameters.AddWithValue("offset", offset);
                await using var reader = await selectCommand.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    items.Add(new ScanListItem { Id = reader.GetInt32(0) });
                }
            }

            return new ScanListPage { Items = items, TotalCount = totalCount };
        }

        public async Task<string?> DeleteScanAsync(int id)
        {
            var connectionString = _configuration.GetConnectionString("Default");
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            const string deleteQuery = "DELETE FROM scans WHERE id = @id RETURNING path";

            await using var command = new NpgsqlCommand(deleteQuery, connection);
            command.Parameters.AddWithValue("id", id);
            var path = await command.ExecuteScalarAsync();

            return (string?)path;
        }
    }
}
