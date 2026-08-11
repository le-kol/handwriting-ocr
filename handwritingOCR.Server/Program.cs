using handwritingOCR.Server.Imaging;
using handwritingOCR.Server.Options;
using handwritingOCR.Server.Serialization;
using handwritingOCR.Server.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.Configure<WordVectorizationOptions>(
    builder.Configuration.GetSection(WordVectorizationOptions.SectionName));
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new Float3DJsonConverter()));
builder.Services.AddScoped<ScanDbService>();
builder.Services.AddScoped<WordDbService>();
builder.Services.AddScoped<FileStorageService>();
builder.Services.AddScoped<WordFragmentExtractor>();
builder.Services.AddScoped<StrokeBezierFitter>();
builder.Services.AddScoped<WordVectorizationService>();
// AddHttpClient, а не AddScoped: сервису нужен HttpClient с переиспользуемым пулом соединений
builder.Services.AddHttpClient<YandexOcrService>();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();
