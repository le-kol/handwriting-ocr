using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using handwritingOCR.Server.Models;

namespace handwritingOCR.Server.Services
{
    // Синхронное распознавание одного изображения через Yandex Vision OCR.
    // Типы исключений различают причину сбоя, контроллер переводит их в коды ответа:
    // ArgumentException — неподдерживаемый формат файла,
    // InvalidOperationException — сервис не настроен в appsettings,
    // HttpRequestException — Yandex ответил ошибкой
    public class YandexOcrService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public YandexOcrService(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        // У возвращённых слов уже заполнен OrderIndex
        public async Task<IReadOnlyList<Word>> RecognizeAsync(
            byte[] imageBytes,
            string fileExtension,
            CancellationToken cancellationToken = default)
        {
            var mimeType = GetMimeType(fileExtension);
            var apiKey = _configuration["YandexOcr:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("Yandex OCR: не задан YandexOcr:ApiKey в appsettings.");
            }

            var folderId = _configuration["YandexOcr:FolderId"];
            if (string.IsNullOrWhiteSpace(folderId))
            {
                throw new InvalidOperationException("Yandex OCR: не задан YandexOcr:FolderId в appsettings.");
            }

            var endpoint = _configuration["YandexOcr:Endpoint"]
                ?? "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText";
            var model = _configuration["YandexOcr:Model"] ?? "handwritten";
            var languageCodes = _configuration.GetSection("YandexOcr:LanguageCodes").Get<string[]>()
                ?? ["ru", "en"];

            var requestBody = new
            {
                mimeType,
                languageCodes,
                model,
                content = Convert.ToBase64String(imageBytes)
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
            request.Headers.Authorization = new AuthenticationHeaderValue("Api-Key", apiKey);
            request.Headers.Add("x-folder-id", folderId);
            request.Content = new StringContent(
                JsonSerializer.Serialize(requestBody),
                Encoding.UTF8,
                "application/json");

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(
                    $"Yandex OCR вернул {(int)response.StatusCode}: {responseBody}");
            }

            return ParseWords(responseBody);
        }

        // Слова лежат в ответе на третьем уровне вложенности: blocks -> lines -> words.
        // Порядок обхода этой структуры и есть порядок чтения текста
        private static List<Word> ParseWords(string responseBody)
        {
            var words = new List<Word>();

            using var document = JsonDocument.Parse(responseBody);
            if (!document.RootElement.TryGetProperty("result", out var result) ||
                !result.TryGetProperty("textAnnotation", out var textAnnotation) ||
                !textAnnotation.TryGetProperty("blocks", out var blocks))
            {
                return words;
            }

            foreach (var block in blocks.EnumerateArray())
            {
                if (!block.TryGetProperty("lines", out var lines))
                {
                    continue;
                }

                foreach (var line in lines.EnumerateArray())
                {
                    if (!line.TryGetProperty("words", out var lineWords))
                    {
                        continue;
                    }

                    foreach (var wordElement in lineWords.EnumerateArray())
                    {
                        var text = wordElement.TryGetProperty("text", out var textElement)
                            ? textElement.GetString() ?? string.Empty
                            : string.Empty;

                        if (string.IsNullOrWhiteSpace(text))
                        {
                            continue;
                        }

                        // Номер берётся из количества уже собранных слов, а не из позиции
                        // в ответе, поэтому пропуски не оставляют дыр в нумерации
                        var word = ParseBoundingBox(wordElement);
                        word.Text = text;
                        word.OrderIndex = words.Count;
                        words.Add(word);
                    }
                }
            }

            return words;
        }

        // Если рамки в ответе нет, слово остаётся с нулевыми координатами: оно всё равно
        // сохранится и попадёт в порядок чтения, но на изображении его нечем подсветить
        private static Word ParseBoundingBox(JsonElement wordElement)
        {
            var word = new Word();

            if (!wordElement.TryGetProperty("boundingBox", out var boundingBox) ||
                !boundingBox.TryGetProperty("vertices", out var vertices))
            {
                return word;
            }

            var points = vertices.EnumerateArray().ToArray();
            if (points.Length < 4)
            {
                return word;
            }

            word.X1 = ParseCoordinate(points[0], "x");
            word.Y1 = ParseCoordinate(points[0], "y");
            word.X2 = ParseCoordinate(points[1], "x");
            word.Y2 = ParseCoordinate(points[1], "y");
            word.X3 = ParseCoordinate(points[2], "x");
            word.Y3 = ParseCoordinate(points[2], "y");
            word.X4 = ParseCoordinate(points[3], "x");
            word.Y4 = ParseCoordinate(points[3], "y");

            return word;
        }

        // Координаты приходят строками ("x": "28"). Нулевые значения API не присылает вовсе,
        // поэтому отсутствующее свойство — это координата 0, а не признак ошибки
        private static float ParseCoordinate(JsonElement vertex, string propertyName)
        {
            if (!vertex.TryGetProperty(propertyName, out var property))
            {
                return 0;
            }

            return float.Parse(property.GetString()!, CultureInfo.InvariantCulture);
        }

        // Вопреки названию поля mimeType, API ждёт короткое имя формата (PNG, JPEG, PDF),
        // а не MIME-тип вида image/png
        private static string GetMimeType(string extension)
        {
            return extension.ToLowerInvariant() switch
            {
                ".png" => "PNG",
                ".jpg" or ".jpeg" => "JPEG",
                _ => throw new ArgumentException($"Неподдерживаемый формат: {extension}")
            };
        }
    }
}
