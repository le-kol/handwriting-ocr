namespace handwritingOCR.Server.Models
{
    public class WordListPage
    {
        public List<Word> Items { get; set; } = [];

        public int TotalCount { get; set; }
    }
}
