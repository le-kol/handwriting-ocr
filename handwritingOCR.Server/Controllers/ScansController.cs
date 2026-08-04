using handwritingOCR.Server.Models;
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
        private readonly WordDbService _wordDbService;
        private readonly YandexOcrService _yandexOcrService;

        public ScansController(
            FileStorageService fileStorageService,
            ScanDbService scanDbService,
            WordDbService wordDbService,
            YandexOcrService yandexOcrService)
        {
            _fileStorageService = fileStorageService;
            _scanDbService = scanDbService;
            _wordDbService = wordDbService;
            _yandexOcrService = yandexOcrService;
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

        // Метод для получения файлов изображений по id с сервера
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

        [HttpGet("{id}/words")]
        public async Task<IActionResult> GetWords(int id)
        {
            string? path = await _scanDbService.GetScanPathAsync(id);
            if (path == null) return NotFound("Не найдена запись в БД");

            var words = await _wordDbService.GetWordsByScanIdAsync(id);
            return Ok(words);
        }

        // Позиция слова берётся из orderIndex тела запроса.
        // Поля id и scanId из тела игнорируются: id выдаёт БД, скан задаётся адресом
        [HttpPost("{id}/words")]
        public async Task<IActionResult> CreateWord(int id, [FromBody] Word word)
        {
            if (string.IsNullOrWhiteSpace(word.Text))
            {
                return BadRequest("Текст слова не может быть пустым");
            }

            if (word.OrderIndex < 0)
            {
                return BadRequest("orderIndex не может быть отрицательным");
            }

            string? path = await _scanDbService.GetScanPathAsync(id);
            if (path == null) return NotFound("Не найдена запись в БД");

            word.Text = word.Text.Trim();
            var inserted = await _wordDbService.InsertAtAsync(id, word.OrderIndex, word);

            return CreatedAtAction(nameof(GetWords), new { id }, inserted);
        }

        // Поля id и scanId из тела игнорируются: слово определяется адресом
        [HttpPut("{id}/words/{wordId}")]
        public async Task<IActionResult> UpdateWord(int id, int wordId, [FromBody] Word word)
        {
            if (string.IsNullOrWhiteSpace(word.Text))
            {
                return BadRequest("Текст слова не может быть пустым");
            }

            if (word.OrderIndex < 0)
            {
                return BadRequest("orderIndex не может быть отрицательным");
            }

            word.Text = word.Text.Trim();
            var updated = await _wordDbService.UpdateWordAsync(id, wordId, word);
            if (updated == null) return NotFound("Слово не найдено");

            return Ok(updated);
        }

        [HttpDelete("{id}/words/{wordId}")]
        public async Task<IActionResult> DeleteWord(int id, int wordId)
        {
            var deleted = await _wordDbService.DeleteWordAsync(id, wordId);
            if (!deleted) return NotFound("Слово не найдено");

            return NoContent();
        }

        // Результат распознавания полностью заменяет прежние слова скана
        [HttpPost("{id}/recognize")]
        public async Task<IActionResult> Recognize(int id, CancellationToken cancellationToken)
        {
            string? path = await _scanDbService.GetScanPathAsync(id);
            if (path == null) return NotFound("Не найдена запись в БД");

            var fileBytes = await _fileStorageService.GetFileAsync(path);
            if (fileBytes == null) return NotFound("Не найден файл");

            try
            {
                var recognizedWords = await _yandexOcrService.RecognizeAsync(
                    fileBytes,
                    Path.GetExtension(path),
                    cancellationToken);
                await _wordDbService.ReplaceWordsFromOcrAsync(id, recognizedWords);

                return Ok(await _wordDbService.GetWordsByScanIdAsync(id));
            }
            catch (ArgumentException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, ex.Message);
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(StatusCodes.Status502BadGateway, ex.Message);
            }
        }
    }
}
