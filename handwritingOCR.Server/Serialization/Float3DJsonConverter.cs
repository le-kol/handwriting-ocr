using System.Text.Json;
using System.Text.Json.Serialization;

namespace handwritingOCR.Server.Serialization
{
    // System.Text.Json не сериализует float[,,] сам; в БД и модели остаётся прямоугольный массив
    // для Npgsql, а в HTTP отдаём вложенный JSON [[[x,y],...],...].
    public sealed class Float3DJsonConverter : JsonConverter<float[,,]>
    {
        public override float[,,] Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            throw new NotSupportedException("Десериализация float[,,] из JSON не поддерживается.");
        }

        public override void Write(Utf8JsonWriter writer, float[,,] value, JsonSerializerOptions options)
        {
            var n0 = value.GetLength(0);
            var n1 = value.GetLength(1);
            var n2 = value.GetLength(2);

            writer.WriteStartArray();
            for (var i = 0; i < n0; i++)
            {
                writer.WriteStartArray();
                for (var j = 0; j < n1; j++)
                {
                    writer.WriteStartArray();
                    for (var k = 0; k < n2; k++)
                    {
                        writer.WriteNumberValue(value[i, j, k]);
                    }

                    writer.WriteEndArray();
                }

                writer.WriteEndArray();
            }

            writer.WriteEndArray();
        }
    }
}
