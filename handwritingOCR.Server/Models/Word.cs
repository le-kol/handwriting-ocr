namespace handwritingOCR.Server.Models
{
    // Слово на скане. Используется и для результатов OCR, и для строк таблицы words,
    // и для тела запросов на создание/изменение слова
    public class Word
    {
        // Id и ScanId задаёт сервер: у слова из OCR они нулевые, а присланные в теле
        // запроса значения не используются — их перезаписывают id из БД и скан из адреса
        public int Id { get; set; }
        public int ScanId { get; set; }
        public string Text { get; set; } = string.Empty;
        // Четыре вершины рамки слова в том порядке, в котором их возвращает Yandex OCR.
        // Рамка может быть повёрнутым четырёхугольником, поэтому храним все 8 координат
        public float X1 { get; set; }
        public float Y1 { get; set; }
        public float X2 { get; set; }
        public float Y2 { get; set; }
        public float X3 { get; set; }
        public float Y3 { get; set; }
        public float X4 { get; set; }
        public float Y4 { get; set; }
        // Позиция слова в порядке чтения скана, нумерация плотная: 0, 1, 2, ...
        public int OrderIndex { get; set; }
    }
}
