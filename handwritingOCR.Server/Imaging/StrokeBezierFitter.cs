using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace handwritingOCR.Server.Imaging
{
    public class StrokeBezierFitter
    {
        private static readonly (int Dx, int Dy)[] Neighbors8 =
        [
            (0, -1), (1, -1), (1, 0), (1, 1),
            (0, 1), (-1, 1), (-1, 0), (-1, -1),
        ];

        // Форма float[,,]: [кривая, точка 0..3, x|y] — как words.curve_points в PostgreSQL.
        public float[,,] Fit(Image<Rgba32> fragment, float approximationTolerance)
        {
            if (approximationTolerance <= 0)
            {
                throw new ArgumentException("ApproximationTolerance должен быть больше 0.");
            }

            using var gray = fragment.CloneAs<L8>();
            var binary = BinarizeInk(gray);
            ZhangSuenThinning(binary);
            var polylines = TraceSkeleton(binary);

            var curves = new List<(PointF P0, PointF P1, PointF P2, PointF P3)>();
            foreach (var line in polylines)
            {
                if (line.Count < 2)
                {
                    continue;
                }

                FitPolyline(line, approximationTolerance, curves);
            }

            if (curves.Count == 0)
            {
                throw new ArgumentException("Не удалось выделить штрихи слова.");
            }

            var result = new float[curves.Count, 4, 2];
            for (var i = 0; i < curves.Count; i++)
            {
                var c = curves[i];
                result[i, 0, 0] = c.P0.X;
                result[i, 0, 1] = c.P0.Y;
                result[i, 1, 0] = c.P1.X;
                result[i, 1, 1] = c.P1.Y;
                result[i, 2, 0] = c.P2.X;
                result[i, 2, 1] = c.P2.Y;
                result[i, 3, 0] = c.P3.X;
                result[i, 3, 1] = c.P3.Y;
            }

            return result;
        }

        private static bool[,] BinarizeInk(Image<L8> gray)
        {
            var w = gray.Width;
            var h = gray.Height;
            var hist = new int[256];
            gray.ProcessPixelRows(accessor =>
            {
                for (var y = 0; y < h; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (var x = 0; x < w; x++)
                    {
                        hist[row[x].PackedValue]++;
                    }
                }
            });

            var threshold = OtsuThreshold(hist, w * h);
            var binary = new bool[h, w];
            gray.ProcessPixelRows(accessor =>
            {
                for (var y = 0; y < h; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (var x = 0; x < w; x++)
                    {
                        // Чернила темнее фона
                        binary[y, x] = row[x].PackedValue <= threshold;
                    }
                }
            });

            return binary;
        }

        private static int OtsuThreshold(int[] hist, int total)
        {
            if (total <= 0)
            {
                return 128;
            }

            long sum = 0;
            for (var i = 0; i < 256; i++)
            {
                sum += i * (long)hist[i];
            }

            long sumB = 0;
            long wB = 0;
            double maxVar = -1;
            var threshold = 128;

            for (var t = 0; t < 256; t++)
            {
                wB += hist[t];
                if (wB == 0)
                {
                    continue;
                }

                var wF = total - wB;
                if (wF == 0)
                {
                    break;
                }

                sumB += t * (long)hist[t];
                var mB = (double)sumB / wB;
                var mF = (double)(sum - sumB) / wF;
                var between = wB * (double)wF * (mB - mF) * (mB - mF);
                if (between > maxVar)
                {
                    maxVar = between;
                    threshold = t;
                }
            }

            return threshold;
        }

        private static void ZhangSuenThinning(bool[,] img)
        {
            var h = img.GetLength(0);
            var w = img.GetLength(1);
            var changed = true;

            while (changed)
            {
                changed = false;
                changed |= ThinningPass(img, h, w, firstPass: true);
                changed |= ThinningPass(img, h, w, firstPass: false);
            }
        }

        private static bool ThinningPass(bool[,] img, int h, int w, bool firstPass)
        {
            var toRemove = new List<(int Y, int X)>();

            for (var y = 1; y < h - 1; y++)
            {
                for (var x = 1; x < w - 1; x++)
                {
                    if (!img[y, x])
                    {
                        continue;
                    }

                    var p2 = img[y - 1, x] ? 1 : 0;
                    var p3 = img[y - 1, x + 1] ? 1 : 0;
                    var p4 = img[y, x + 1] ? 1 : 0;
                    var p5 = img[y + 1, x + 1] ? 1 : 0;
                    var p6 = img[y + 1, x] ? 1 : 0;
                    var p7 = img[y + 1, x - 1] ? 1 : 0;
                    var p8 = img[y, x - 1] ? 1 : 0;
                    var p9 = img[y - 1, x - 1] ? 1 : 0;

                    var b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
                    if (b < 2 || b > 6)
                    {
                        continue;
                    }

                    var a = CountTransitions(p2, p3, p4, p5, p6, p7, p8, p9);
                    if (a != 1)
                    {
                        continue;
                    }

                    if (firstPass)
                    {
                        if (p2 * p4 * p6 != 0 || p4 * p6 * p8 != 0)
                        {
                            continue;
                        }
                    }
                    else if (p2 * p4 * p8 != 0 || p2 * p6 * p8 != 0)
                    {
                        continue;
                    }

                    toRemove.Add((y, x));
                }
            }

            foreach (var (y, x) in toRemove)
            {
                img[y, x] = false;
            }

            return toRemove.Count > 0;
        }

        private static int CountTransitions(params int[] p)
        {
            var transitions = 0;
            for (var i = 0; i < 8; i++)
            {
                if (p[i] == 0 && p[(i + 1) % 8] == 1)
                {
                    transitions++;
                }
            }

            return transitions;
        }

        private static List<List<PointF>> TraceSkeleton(bool[,] img)
        {
            var h = img.GetLength(0);
            var w = img.GetLength(1);
            var visited = new bool[h, w];
            var lines = new List<List<PointF>>();

            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    if (!img[y, x] || visited[y, x])
                    {
                        continue;
                    }

                    var degree = CountNeighbors(img, x, y, w, h);
                    if (degree != 1 && degree != 0)
                    {
                        continue;
                    }

                    // Старт с конца штриха (или одиночного пикселя)
                    var line = Walk(img, visited, x, y, w, h);
                    if (line.Count >= 2)
                    {
                        lines.Add(line);
                    }
                }
            }

            // Оставшиеся петли / компоненты без явных концов
            for (var y = 0; y < h; y++)
            {
                for (var x = 0; x < w; x++)
                {
                    if (!img[y, x] || visited[y, x])
                    {
                        continue;
                    }

                    var line = Walk(img, visited, x, y, w, h);
                    if (line.Count >= 2)
                    {
                        lines.Add(line);
                    }
                }
            }

            return lines;
        }

        private static List<PointF> Walk(bool[,] img, bool[,] visited, int startX, int startY, int w, int h)
        {
            var line = new List<PointF>();
            var x = startX;
            var y = startY;
            var prevX = -1;
            var prevY = -1;

            while (true)
            {
                visited[y, x] = true;
                line.Add(new PointF(x + 0.5f, y + 0.5f));

                var nextX = -1;
                var nextY = -1;
                var found = false;

                foreach (var (dx, dy) in Neighbors8)
                {
                    var nx = x + dx;
                    var ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h)
                    {
                        continue;
                    }

                    if (!img[ny, nx] || visited[ny, nx])
                    {
                        continue;
                    }

                    if (nx == prevX && ny == prevY)
                    {
                        continue;
                    }

                    nextX = nx;
                    nextY = ny;
                    found = true;
                    break;
                }

                if (!found)
                {
                    break;
                }

                prevX = x;
                prevY = y;
                x = nextX;
                y = nextY;
            }

            return line;
        }

        private static int CountNeighbors(bool[,] img, int x, int y, int w, int h)
        {
            var count = 0;
            foreach (var (dx, dy) in Neighbors8)
            {
                var nx = x + dx;
                var ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h)
                {
                    continue;
                }

                if (img[ny, nx])
                {
                    count++;
                }
            }

            return count;
        }

        private static void FitPolyline(
            List<PointF> points,
            float tolerance,
            List<(PointF P0, PointF P1, PointF P2, PointF P3)> curves)
        {
            FitSegment(points, 0, points.Count - 1, tolerance, curves);
        }

        private static void FitSegment(
            List<PointF> points,
            int start,
            int end,
            float tolerance,
            List<(PointF P0, PointF P1, PointF P2, PointF P3)> curves)
        {
            if (end <= start)
            {
                return;
            }

            if (end == start + 1)
            {
                var a = points[start];
                var b = points[end];
                var dx = (b.X - a.X) / 3f;
                var dy = (b.Y - a.Y) / 3f;
                curves.Add((a, new PointF(a.X + dx, a.Y + dy), new PointF(a.X + 2 * dx, a.Y + 2 * dy), b));
                return;
            }

            var p0 = points[start];
            var p3 = points[end];
            var chord = Distance(p0, p3);
            PointF t0;
            PointF t3;

            if (chord < 1e-3f)
            {
                // Почти точка — короткая вырожденная кривая вокруг пикселя
                curves.Add((p0, p0, p3, p3));
                return;
            }

            if (start + 1 <= end)
            {
                t0 = Normalize(Sub(points[start + 1], p0));
            }
            else
            {
                t0 = Normalize(Sub(p3, p0));
            }

            if (end - 1 >= start)
            {
                t3 = Normalize(Sub(p3, points[end - 1]));
            }
            else
            {
                t3 = Normalize(Sub(p3, p0));
            }

            var p1 = new PointF(p0.X + t0.X * chord / 3f, p0.Y + t0.Y * chord / 3f);
            var p2 = new PointF(p3.X - t3.X * chord / 3f, p3.Y - t3.Y * chord / 3f);

            var (maxDist, splitAt) = MaxDeviation(points, start, end, p0, p1, p2, p3);
            if (maxDist <= tolerance || splitAt <= start || splitAt >= end)
            {
                curves.Add((p0, p1, p2, p3));
                return;
            }

            FitSegment(points, start, splitAt, tolerance, curves);
            FitSegment(points, splitAt, end, tolerance, curves);
        }

        private static (float MaxDist, int Index) MaxDeviation(
            List<PointF> points,
            int start,
            int end,
            PointF p0,
            PointF p1,
            PointF p2,
            PointF p3)
        {
            var totalLen = 0f;
            var lengths = new float[end - start + 1];
            lengths[0] = 0;
            for (var i = start + 1; i <= end; i++)
            {
                totalLen += Distance(points[i - 1], points[i]);
                lengths[i - start] = totalLen;
            }

            if (totalLen < 1e-6f)
            {
                return (0, start);
            }

            var maxDist = 0f;
            var maxIdx = start;
            for (var i = start + 1; i < end; i++)
            {
                var t = lengths[i - start] / totalLen;
                var b = EvalCubic(p0, p1, p2, p3, t);
                var d = Distance(points[i], b);
                if (d > maxDist)
                {
                    maxDist = d;
                    maxIdx = i;
                }
            }

            return (maxDist, maxIdx);
        }

        private static PointF EvalCubic(PointF p0, PointF p1, PointF p2, PointF p3, float t)
        {
            var u = 1 - t;
            var tt = t * t;
            var uu = u * u;
            var uuu = uu * u;
            var ttt = tt * t;
            return new PointF(
                uuu * p0.X + 3 * uu * t * p1.X + 3 * u * tt * p2.X + ttt * p3.X,
                uuu * p0.Y + 3 * uu * t * p1.Y + 3 * u * tt * p2.Y + ttt * p3.Y);
        }

        private static PointF Sub(PointF a, PointF b) => new(a.X - b.X, a.Y - b.Y);

        private static PointF Normalize(PointF v)
        {
            var len = MathF.Sqrt(v.X * v.X + v.Y * v.Y);
            if (len < 1e-6f)
            {
                return new PointF(1, 0);
            }

            return new PointF(v.X / len, v.Y / len);
        }

        private static float Distance(PointF a, PointF b)
        {
            var dx = a.X - b.X;
            var dy = a.Y - b.Y;
            return MathF.Sqrt(dx * dx + dy * dy);
        }

        private readonly struct PointF
        {
            public PointF(float x, float y)
            {
                X = x;
                Y = y;
            }

            public float X { get; }
            public float Y { get; }
        }
    }
}
