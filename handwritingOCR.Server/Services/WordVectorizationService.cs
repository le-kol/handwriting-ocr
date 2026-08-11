using handwritingOCR.Server.Imaging;
using handwritingOCR.Server.Models;
using handwritingOCR.Server.Options;
using Microsoft.Extensions.Options;

namespace handwritingOCR.Server.Services
{
    public class WordVectorizationService
    {
        private readonly WordDbService _wordDbService;
        private readonly ScanDbService _scanDbService;
        private readonly FileStorageService _fileStorageService;
        private readonly WordFragmentExtractor _fragmentExtractor;
        private readonly StrokeBezierFitter _strokeBezierFitter;
        private readonly WordVectorizationOptions _options;

        public WordVectorizationService(
            WordDbService wordDbService,
            ScanDbService scanDbService,
            FileStorageService fileStorageService,
            WordFragmentExtractor fragmentExtractor,
            StrokeBezierFitter strokeBezierFitter,
            IOptions<WordVectorizationOptions> options)
        {
            _wordDbService = wordDbService;
            _scanDbService = scanDbService;
            _fileStorageService = fileStorageService;
            _fragmentExtractor = fragmentExtractor;
            _strokeBezierFitter = strokeBezierFitter;
            _options = options.Value;
        }

        public async Task<Word> VectorizeAsync(int scanId, int wordId)
        {
            EnsureOptionsValid();

            var path = await _scanDbService.GetScanPathAsync(scanId);
            if (path == null)
            {
                throw new ResourceNotFoundException("Не найдена запись в БД");
            }

            var word = await _wordDbService.GetWordAsync(scanId, wordId);
            if (word == null)
            {
                throw new ResourceNotFoundException("Слово не найдено");
            }

            var fileBytes = await _fileStorageService.GetFileAsync(path);
            if (fileBytes == null)
            {
                throw new ResourceNotFoundException("Не найден файл");
            }

            // Полный новый вектор считаем до любой записи в БД — сбой не затирает прежний curve_points
            using var fragment = _fragmentExtractor.ExtractAlignedFragment(
                fileBytes,
                word.X1,
                word.Y1,
                word.X2,
                word.Y2,
                word.X3,
                word.Y3,
                word.X4,
                word.Y4,
                _options.PaddingPx!.Value);

            var curvePoints = _strokeBezierFitter.Fit(fragment, _options.ApproximationTolerance!.Value);

            var updated = await _wordDbService.UpdateCurvePointsAsync(scanId, wordId, curvePoints);
            if (updated == null)
            {
                throw new ResourceNotFoundException("Слово не найдено");
            }

            return updated;
        }

        private void EnsureOptionsValid()
        {
            if (_options.PaddingPx is null || _options.ApproximationTolerance is null
                || _options.PaddingPx < 0 || _options.ApproximationTolerance <= 0)
            {
                throw new InvalidOperationException(
                    "Не задана или невалидна конфигурация WordVectorization: PaddingPx ≥ 0, ApproximationTolerance > 0.");
            }
        }
    }
}
