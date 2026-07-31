using handwritingOCR.Server.Services;
using Microsoft.AspNetCore.Mvc;

namespace handwritingOCR.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ScansController : ControllerBase
    {
        private readonly FileStorageService _fileStorageService;
        private readonly ScanDbService _scanDbService;

        public ScansController(FileStorageService fileStorageService, ScanDbService scanDbService)
        {
            _fileStorageService = fileStorageService;
            _scanDbService = scanDbService;
        }

        // Метод для загрузки файлов изображений на сервер
        [HttpPost("upload")]
        public async Task<IActionResult> Upload(IFormFile file)
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest("Файл не загружен");
            }

            if (!_fileStorageService.IsAllowed(file))
            {
                return BadRequest("Недопустимый формат");
            }

            string filePath = await _fileStorageService.SaveFileAsync(file);
            int scanId = await _scanDbService.InsertScanAsync(filePath);
            return Ok(new { id = scanId });
        }

        // Метод для получния файлов изображений по id с сервера
        [HttpGet("{id}/image")]
        public async Task<IActionResult> GetImage(int id)
        {
            string? path = await _scanDbService.GetScanPathAsync(id);
            if (path == null) return NotFound("Не найдена запись в БД");

            var fileBytes = await _fileStorageService.GetFileAsync(path);
            if (fileBytes == null) return NotFound("Не найден файл");

            // Формирование значения для заголовка с типом данных для ответа
            string contentType = "image/png";
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".png":
                    break;
                case ".jpeg":
                case ".jpg":
                    contentType = "image/jpeg";
                    break;
                default:
                    return StatusCode(StatusCodes.Status500InternalServerError);
            }

            return File(fileBytes, contentType);
        }
    }
}
