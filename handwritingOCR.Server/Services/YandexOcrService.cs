using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace handwritingOCR.Server.Services
{
    public class YandexOcrService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;

        public YandexOcrService(HttpClient httpClient, IConfiguration configuration)
        {
            _httpClient = httpClient;
            _configuration = configuration;
        }

        public async Task<string> RecognizeAsync(byte[] imageBytes, string fileExtension, CancellationToken cancellationToken = default)
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

            using var document = JsonDocument.Parse(responseBody);
            if (document.RootElement.TryGetProperty("result", out var result) &&
                result.TryGetProperty("textAnnotation", out var textAnnotation) &&
                textAnnotation.TryGetProperty("fullText", out var fullText))
            {
                return fullText.GetString() ?? string.Empty;
            }

            return string.Empty;
        }

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
