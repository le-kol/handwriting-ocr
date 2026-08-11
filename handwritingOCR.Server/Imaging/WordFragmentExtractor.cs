using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace handwritingOCR.Server.Imaging
{
    public class WordFragmentExtractor
    {
        private const float MinGeometryPx = 1.0f;

        // Координаты результата — в системе фрагмента (0..W, 0..H), не абсолютные скана.
        // Вырожденность и пересечение с изображением проверяем до padding; клип отступа у края — норма.
        public Image<Rgba32> ExtractAlignedFragment(
            byte[] scanBytes,
            float x1,
            float y1,
            float x2,
            float y2,
            float x3,
            float y3,
            float x4,
            float y4,
            float paddingPx)
        {
            Image<Rgba32> source;
            try
            {
                source = Image.Load<Rgba32>(scanBytes);
            }
            catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
            {
                throw new ArgumentException("Повреждённое или нечитаемое изображение скана.", ex);
            }

            using (source)
            {
                var quad = new[]
                {
                    new PointF(x1, y1),
                    new PointF(x2, y2),
                    new PointF(x3, y3),
                    new PointF(x4, y4),
                };

                EnsureQuadValid(quad);
                EnsureIntersectsImage(quad, source.Width, source.Height);

                var padded = ExpandQuad(quad, paddingPx);
                ClipQuadToImage(padded, source.Width, source.Height);

                var widthTop = Distance(padded[0], padded[1]);
                var widthBottom = Distance(padded[3], padded[2]);
                var heightLeft = Distance(padded[0], padded[3]);
                var heightRight = Distance(padded[1], padded[2]);

                var outW = Math.Max(1, (int)MathF.Round(Math.Max(widthTop, widthBottom)));
                var outH = Math.Max(1, (int)MathF.Round(Math.Max(heightLeft, heightRight)));

                return WarpPerspective(source, padded, outW, outH);
            }
        }

        private static void EnsureQuadValid(PointF[] quad)
        {
            var area = PolygonArea(quad);
            if (area < MinGeometryPx)
            {
                throw new ArgumentException("Вырожденная рамка слова.");
            }

            for (var i = 0; i < 4; i++)
            {
                if (Distance(quad[i], quad[(i + 1) % 4]) < MinGeometryPx)
                {
                    throw new ArgumentException("Вырожденная рамка слова.");
                }
            }
        }

        private static void EnsureIntersectsImage(PointF[] quad, int width, int height)
        {
            var clipped = ClipPolygonToRect(quad, 0, 0, width, height);
            if (clipped.Count < 3 || PolygonArea(clipped) < MinGeometryPx)
            {
                throw new ArgumentException("Рамка слова не пересекается с изображением скана.");
            }
        }

        private static PointF[] ExpandQuad(PointF[] quad, float paddingPx)
        {
            if (paddingPx <= 0)
            {
                return (PointF[])quad.Clone();
            }

            var signedArea = SignedPolygonArea(quad);
            var outwardSign = signedArea >= 0 ? 1f : -1f;
            var expanded = new PointF[4];

            for (var i = 0; i < 4; i++)
            {
                var prev = quad[(i + 3) % 4];
                var curr = quad[i];
                var next = quad[(i + 1) % 4];

                var n1 = EdgeNormal(prev, curr, outwardSign);
                var n2 = EdgeNormal(curr, next, outwardSign);
                var dirX = n1.X + n2.X;
                var dirY = n1.Y + n2.Y;
                var len = MathF.Sqrt(dirX * dirX + dirY * dirY);
                if (len < 1e-6f)
                {
                    dirX = n1.X;
                    dirY = n1.Y;
                    len = MathF.Sqrt(dirX * dirX + dirY * dirY);
                }

                if (len < 1e-6f)
                {
                    expanded[i] = curr;
                    continue;
                }

                expanded[i] = new PointF(
                    curr.X + dirX / len * paddingPx,
                    curr.Y + dirY / len * paddingPx);
            }

            return expanded;
        }

        private static void ClipQuadToImage(PointF[] quad, int width, int height)
        {
            var maxX = width - 1e-3f;
            var maxY = height - 1e-3f;
            for (var i = 0; i < quad.Length; i++)
            {
                quad[i] = new PointF(
                    Math.Clamp(quad[i].X, 0, maxX),
                    Math.Clamp(quad[i].Y, 0, maxY));
            }
        }

        private static PointF EdgeNormal(PointF a, PointF b, float outwardSign)
        {
            var dx = b.X - a.X;
            var dy = b.Y - a.Y;
            var len = MathF.Sqrt(dx * dx + dy * dy);
            if (len < 1e-6f)
            {
                return new PointF(0, 0);
            }

            // Для CCW (signedArea > 0) внешняя нормаль — правая относительно направления ребра
            return new PointF(outwardSign * dy / len, -outwardSign * dx / len);
        }

        private static Image<Rgba32> WarpPerspective(
            Image<Rgba32> source,
            PointF[] srcQuad,
            int outW,
            int outH)
        {
            var dst = new[]
            {
                new PointF(0, 0),
                new PointF(outW - 1, 0),
                new PointF(outW - 1, outH - 1),
                new PointF(0, outH - 1),
            };

            // H отображает точку фрагмента → координаты скана
            var h = ComputeHomography(dst, srcQuad);
            var result = new Image<Rgba32>(outW, outH);

            result.ProcessPixelRows(accessor =>
            {
                for (var y = 0; y < outH; y++)
                {
                    var row = accessor.GetRowSpan(y);
                    for (var x = 0; x < outW; x++)
                    {
                        var (sx, sy) = ApplyHomography(h, x, y);
                        row[x] = SampleBilinear(source, sx, sy);
                    }
                }
            });

            return result;
        }

        private static float[] ComputeHomography(PointF[] src, PointF[] dst)
        {
            // Решаем A * h = b для h (8 неизвестных, h33 = 1) методом Гаусса
            var a = new float[8, 8];
            var b = new float[8];

            for (var i = 0; i < 4; i++)
            {
                var x = src[i].X;
                var y = src[i].Y;
                var u = dst[i].X;
                var v = dst[i].Y;
                var r = i * 2;

                a[r, 0] = x;
                a[r, 1] = y;
                a[r, 2] = 1;
                a[r, 3] = 0;
                a[r, 4] = 0;
                a[r, 5] = 0;
                a[r, 6] = -u * x;
                a[r, 7] = -u * y;
                b[r] = u;

                a[r + 1, 0] = 0;
                a[r + 1, 1] = 0;
                a[r + 1, 2] = 0;
                a[r + 1, 3] = x;
                a[r + 1, 4] = y;
                a[r + 1, 5] = 1;
                a[r + 1, 6] = -v * x;
                a[r + 1, 7] = -v * y;
                b[r + 1] = v;
            }

            return SolveLinearSystem(a, b);
        }

        private static float[] SolveLinearSystem(float[,] a, float[] b)
        {
            var n = b.Length;
            var m = new float[n, n + 1];
            for (var i = 0; i < n; i++)
            {
                for (var j = 0; j < n; j++)
                {
                    m[i, j] = a[i, j];
                }

                m[i, n] = b[i];
            }

            for (var col = 0; col < n; col++)
            {
                var pivot = col;
                for (var row = col + 1; row < n; row++)
                {
                    if (MathF.Abs(m[row, col]) > MathF.Abs(m[pivot, col]))
                    {
                        pivot = row;
                    }
                }

                if (MathF.Abs(m[pivot, col]) < 1e-8f)
                {
                    throw new ArgumentException("Вырожденная рамка слова.");
                }

                if (pivot != col)
                {
                    for (var j = col; j <= n; j++)
                    {
                        (m[col, j], m[pivot, j]) = (m[pivot, j], m[col, j]);
                    }
                }

                var diag = m[col, col];
                for (var j = col; j <= n; j++)
                {
                    m[col, j] /= diag;
                }

                for (var row = 0; row < n; row++)
                {
                    if (row == col)
                    {
                        continue;
                    }

                    var factor = m[row, col];
                    for (var j = col; j <= n; j++)
                    {
                        m[row, j] -= factor * m[col, j];
                    }
                }
            }

            var x = new float[n];
            for (var i = 0; i < n; i++)
            {
                x[i] = m[i, n];
            }

            return x;
        }

        private static (float X, float Y) ApplyHomography(float[] h, float x, float y)
        {
            var w = h[6] * x + h[7] * y + 1f;
            if (MathF.Abs(w) < 1e-8f)
            {
                w = 1e-8f;
            }

            return (
                (h[0] * x + h[1] * y + h[2]) / w,
                (h[3] * x + h[4] * y + h[5]) / w);
        }

        private static Rgba32 SampleBilinear(Image<Rgba32> image, float x, float y)
        {
            if (x < 0 || y < 0 || x >= image.Width - 1 || y >= image.Height - 1)
            {
                var cx = Math.Clamp((int)MathF.Round(x), 0, image.Width - 1);
                var cy = Math.Clamp((int)MathF.Round(y), 0, image.Height - 1);
                return image[cx, cy];
            }

            var x0 = (int)MathF.Floor(x);
            var y0 = (int)MathF.Floor(y);
            var x1 = x0 + 1;
            var y1 = y0 + 1;
            var fx = x - x0;
            var fy = y - y0;

            var c00 = image[x0, y0];
            var c10 = image[x1, y0];
            var c01 = image[x0, y1];
            var c11 = image[x1, y1];

            static byte Lerp(byte a, byte b, float t) => (byte)Math.Clamp(a + (b - a) * t, 0, 255);

            var r0 = Lerp(c00.R, c10.R, fx);
            var g0 = Lerp(c00.G, c10.G, fx);
            var b0 = Lerp(c00.B, c10.B, fx);
            var a0 = Lerp(c00.A, c10.A, fx);
            var r1 = Lerp(c01.R, c11.R, fx);
            var g1 = Lerp(c01.G, c11.G, fx);
            var b1 = Lerp(c01.B, c11.B, fx);
            var a1 = Lerp(c01.A, c11.A, fx);

            return new Rgba32(
                Lerp(r0, r1, fy),
                Lerp(g0, g1, fy),
                Lerp(b0, b1, fy),
                Lerp(a0, a1, fy));
        }

        private static List<PointF> ClipPolygonToRect(
            IReadOnlyList<PointF> poly,
            float minX,
            float minY,
            float maxX,
            float maxY)
        {
            var output = poly.ToList();
            output = ClipAgainstEdge(output, p => p.X >= minX, (a, b) => IntersectX(a, b, minX));
            output = ClipAgainstEdge(output, p => p.X <= maxX, (a, b) => IntersectX(a, b, maxX));
            output = ClipAgainstEdge(output, p => p.Y >= minY, (a, b) => IntersectY(a, b, minY));
            output = ClipAgainstEdge(output, p => p.Y <= maxY, (a, b) => IntersectY(a, b, maxY));
            return output;
        }

        private static List<PointF> ClipAgainstEdge(
            List<PointF> input,
            Func<PointF, bool> inside,
            Func<PointF, PointF, PointF> intersect)
        {
            var output = new List<PointF>();
            if (input.Count == 0)
            {
                return output;
            }

            var prev = input[^1];
            foreach (var curr in input)
            {
                var currIn = inside(curr);
                var prevIn = inside(prev);
                if (currIn)
                {
                    if (!prevIn)
                    {
                        output.Add(intersect(prev, curr));
                    }

                    output.Add(curr);
                }
                else if (prevIn)
                {
                    output.Add(intersect(prev, curr));
                }

                prev = curr;
            }

            return output;
        }

        private static PointF IntersectX(PointF a, PointF b, float x)
        {
            var t = MathF.Abs(b.X - a.X) < 1e-8f ? 0 : (x - a.X) / (b.X - a.X);
            return new PointF(x, a.Y + t * (b.Y - a.Y));
        }

        private static PointF IntersectY(PointF a, PointF b, float y)
        {
            var t = MathF.Abs(b.Y - a.Y) < 1e-8f ? 0 : (y - a.Y) / (b.Y - a.Y);
            return new PointF(a.X + t * (b.X - a.X), y);
        }

        private static float Distance(PointF a, PointF b)
        {
            var dx = a.X - b.X;
            var dy = a.Y - b.Y;
            return MathF.Sqrt(dx * dx + dy * dy);
        }

        private static float PolygonArea(IReadOnlyList<PointF> poly) => MathF.Abs(SignedPolygonArea(poly));

        private static float SignedPolygonArea(IReadOnlyList<PointF> poly)
        {
            double sum = 0;
            for (var i = 0; i < poly.Count; i++)
            {
                var j = (i + 1) % poly.Count;
                sum += (double)poly[i].X * poly[j].Y;
                sum -= (double)poly[j].X * poly[i].Y;
            }

            return (float)(sum * 0.5);
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
