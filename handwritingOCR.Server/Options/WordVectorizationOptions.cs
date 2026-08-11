namespace handwritingOCR.Server.Options
{
    public class WordVectorizationOptions
    {
        public const string SectionName = "WordVectorization";

        // null — секция/ключ не заданы в конфигурации (→ 503 при вызове)
        public float? PaddingPx { get; set; }

        public float? ApproximationTolerance { get; set; }
    }
}
