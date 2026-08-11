namespace handwritingOCR.Server.Services
{
    // Сигнал контроллеру: сущность/файл не найдены → HTTP 404 с текстом Message
    public sealed class ResourceNotFoundException : Exception
    {
        public ResourceNotFoundException(string message) : base(message)
        {
        }
    }
}
