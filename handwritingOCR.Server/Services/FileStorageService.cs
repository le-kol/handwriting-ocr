namespace handwritingOCR.Server.Services
{
    public class FileStorageService
    {
        private readonly IConfiguration _configuration;
        private readonly IWebHostEnvironment _environment;
        // допустимые форматы файлов
        private static readonly string[] AllowedExtensions = { ".png", ".jpg", ".jpeg" };

        public FileStorageService(IConfiguration configuration, IWebHostEnvironment environment)
        {
            _configuration = configuration;
            _environment = environment;
        }

        // Метод для проверки форматов файлов.
        // Проверяется только расширение имени, содержимое файла не разбирается
        public bool IsAllowed(IFormFile file)
        {
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            return AllowedExtensions.Contains(extension);
        }

        // Метод для сохранения файла изображения на сервер.
        // Имя заменяется на GUID, чтобы файлы не перезаписывали друг друга, а исходное
        // имя не сохраняется. Возвращается абсолютный путь — он же попадает в таблицу scans,
        // поэтому перенос папки со сканами сделает прежние записи нерабочими
        public async Task<string> SaveFileAsync(IFormFile file)
        {
            // Путь до папки для хранения файлов. Задается в appsettings.json
            var scansFolder = _configuration["Storage:ScansFolder"];
            if (string.IsNullOrWhiteSpace(scansFolder))
            {
                throw new InvalidOperationException("Не задан Storage:ScansFolder в appsettings.");
            }

            var storageFolder = Path.Combine(_environment.ContentRootPath, scansFolder);
            Directory.CreateDirectory(storageFolder);

            var savedFileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
            var fullPath = Path.Combine(storageFolder, savedFileName);

            await using (var stream = new FileStream(fullPath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            return fullPath;
        }

        // метод для получения объекта файла скана по пути до него
        public async Task<byte[]?> GetFileAsync(string path)
        {
            if (!File.Exists(path)) return null;

            var fileBytes = await File.ReadAllBytesAsync(path);
            return fileBytes;
        }

    }
}
