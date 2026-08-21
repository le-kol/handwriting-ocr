using handwritingOCR.Server.Options;
using handwritingOCR.Server.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace handwritingOCR.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WordsController : ControllerBase
    {
        private readonly WordDbService _wordDbService;
        private readonly ScanListOptions _scanListOptions;

        public WordsController(
            WordDbService wordDbService,
            IOptions<ScanListOptions> scanListOptions)
        {
            _wordDbService = wordDbService;
            _scanListOptions = scanListOptions.Value;
        }

        [HttpGet]
        public async Task<IActionResult> GetWordsPage(
            [FromQuery] int page = 1,
            [FromQuery] string? search = null,
            [FromQuery] string vectorized = "all",
            [FromQuery] int? scanId = null)
        {
            if (page < 1)
            {
                return BadRequest("Номер страницы должен быть не меньше 1");
            }

            if (vectorized is not ("all" or "true" or "false"))
            {
                return BadRequest("Недопустимое значение фильтра векторизации");
            }

            var pageSize = _scanListOptions.PageSize;
            if (pageSize <= 0)
            {
                return StatusCode(
                    StatusCodes.Status503ServiceUnavailable,
                    "Не задана или невалидна конфигурация ScanList: PageSize > 0.");
            }

            var result = await _wordDbService.GetWordsPageAsync(
                page,
                pageSize,
                search,
                vectorized,
                scanId);

            return Ok(result);
        }
    }
}
