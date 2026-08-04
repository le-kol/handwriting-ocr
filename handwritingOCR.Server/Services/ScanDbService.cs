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
    }
}
