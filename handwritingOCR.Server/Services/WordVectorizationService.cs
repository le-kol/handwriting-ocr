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

        public (float PaddingPx, float ApproximationTolerance) GetDefaults()
        {
            EnsureOptionsValid();
            return (_options.PaddingPx!.Value, _options.ApproximationTolerance!.Value);
        }

        public (float paddingPx, float approximationTolerance) ValidateAndResolveRunParams(VectorizationRunParamsDto? runParams)
        {
            var errors = new List<string>();

            if (runParams?.PaddingPx is float padding && padding < 0)
            {
                errors.Add("Отступ не может быть отрицательным.");
            }

            if (runParams?.ApproximationTolerance is float tolerance && tolerance <= 0)
            {
                errors.Add("Допустимая погрешность должна быть больше 0.");
            }

            if (errors.Count > 0)
            {
                throw new ArgumentException(string.Join(" ", errors));
            }

            var needsConfigFallback = runParams?.PaddingPx is null || runParams.ApproximationTolerance is null;
            if (needsConfigFallback)
            {
                EnsureOptionsValid();
            }

            var effectivePadding = runParams?.PaddingPx ?? _options.PaddingPx!.Value;
            var effectiveTolerance = runParams?.ApproximationTolerance ?? _options.ApproximationTolerance!.Value;

            return (effectivePadding, effectiveTolerance);
        }

        public async Task<Word> VectorizeAsync(int scanId, int wordId, VectorizationRunParamsDto? runParams = null)
        {
            var (paddingPx, approximationTolerance) = ValidateAndResolveRunParams(runParams);

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

            return await VectorizeWordCoreAsync(word, fileBytes, scanId, paddingPx, approximationTolerance);
        }

        public async Task<IReadOnlyList<Word>> VectorizeBatchAsync(int scanId, VectorizationRunParamsDto? runParams = null)
        {
            var (paddingPx, approximationTolerance) = ValidateAndResolveRunParams(runParams);

            var path = await _scanDbService.GetScanPathAsync(scanId);
            if (path == null)
            {
                throw new ResourceNotFoundException("Не найдена запись в БД");
            }

            var fileBytes = await _fileStorageService.GetFileAsync(path);
            // Один раз читаем файл скана на весь batch — без повторного I/O на каждое слово (SC-005)
            if (fileBytes != null)
            {
                var unvectorizedWords = await _wordDbService.GetUnvectorizedWordsByScanIdAsync(scanId);
                foreach (var word in unvectorizedWords)
                {
                    try
                    {
                        await VectorizeWordCoreAsync(word, fileBytes, scanId, paddingPx, approximationTolerance);
                    }
                    catch (ArgumentException)
                    {
                        // FR-008: per-word сбой не прерывает batch; curve_points остаётся null
                    }
                    catch (ResourceNotFoundException)
                    {
                        // FR-008: per-word сбой не прерывает batch; curve_points остаётся null
                    }
                }
            }

            return await _wordDbService.GetWordsByScanIdAsync(scanId);
        }

        private async Task<Word> VectorizeWordCoreAsync(
            Word word,
            byte[] fileBytes,
            int scanId,
            float paddingPx,
            float approximationTolerance)
        {
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
                paddingPx);

            var curvePoints = _strokeBezierFitter.Fit(fragment, approximationTolerance);

            var updated = await _wordDbService.UpdateCurvePointsAsync(scanId, word.Id, curvePoints);
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
