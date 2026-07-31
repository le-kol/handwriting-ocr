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

        // Метод для проверки форматов файлов
        public bool IsAllowed(IFormFile file)
        {
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            return AllowedExtensions.Contains(extension);
        }

        // Метод для сохранения файла изображения на сервер
        public async Task<string> SaveFileAsync(IFormFile file)
        {
            // Путь до папки для хранения файлов. Задается в appsettings.json
            var storageFolder = Path.Combine(_environment.ContentRootPath, _configuration["Storage:ScansFolder"]);
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
