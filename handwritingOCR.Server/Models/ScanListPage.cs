namespace handwritingOCR.Server.Models
{
    public class ScanListPage
    {
        public List<ScanListItem> Items { get; set; } = [];

        public int TotalCount { get; set; }
    }

    public class ScanListItem
    {
        public int Id { get; set; }
    }
}
