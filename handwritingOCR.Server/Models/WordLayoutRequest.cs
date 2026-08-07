namespace handwritingOCR.Server.Models
{
    // Раскладка слов скана: каждая внутренняя коллекция — id слов одной строки слева направо
    public class WordLayoutRequest
    {
        public List<List<int>> Lines { get; set; } = [];
    }
}
