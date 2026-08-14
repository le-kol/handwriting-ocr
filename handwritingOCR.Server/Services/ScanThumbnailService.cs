using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace handwritingOCR.Server.Services
{
    public class ScanThumbnailService
    {
        private const int MaxSidePx = 200;

        private readonly ScanDbService _scanDbService;
        private readonly FileStorageService _fileStorageService;

        public ScanThumbnailService(ScanDbService scanDbService, FileStorageService fileStorageService)
        {
            _scanDbService = scanDbService;
            _fileStorageService = fileStorageService;
        }

        public async Task<(byte[] Bytes, string ContentType)> GetThumbnailAsync(int id)
        {
            var path = await _scanDbService.GetScanPathAsync(id);
            if (path == null)
            {
                throw new ResourceNotFoundException("Не найдена запись в БД");
            }

            var fileBytes = await _fileStorageService.GetFileAsync(path);
            if (fileBytes == null)
            {
                throw new ResourceNotFoundException("Не найден файл");
            }

            try
            {
                using var image = Image.Load(fileBytes);
                image.Mutate(x => x.Resize(new ResizeOptions
                {
                    Mode = ResizeMode.Max,
                    Size = new Size(MaxSidePx, MaxSidePx),
                }));

                var ext = Path.GetExtension(path).ToLowerInvariant();
                using var ms = new MemoryStream();
                string contentType;
                if (ext is ".jpeg" or ".jpg")
                {
                    contentType = "image/jpeg";
                    await image.SaveAsJpegAsync(ms);
                }
                else
                {
                    contentType = "image/png";
                    await image.SaveAsPngAsync(ms);
                }

                return (ms.ToArray(), contentType);
            }
            catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
            {
                throw new ArgumentException("Повреждённое или нечитаемое изображение скана.", ex);
            }
        }
    }
}
