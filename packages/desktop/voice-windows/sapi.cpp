#include <windows.h>
#include <sapi.h>
#include <wrl/client.h>

#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

static void check(HRESULT result, const char* operation) {
  if (SUCCEEDED(result)) return;
  std::fprintf(stderr, "%s failed (0x%08lx)\n", operation, static_cast<unsigned long>(result));
  std::exit(1);
}

static std::string utf8(const wchar_t* text) {
  const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, nullptr, 0, nullptr, nullptr);
  if (!length) {
    std::fputs("Could not encode voice information as UTF-8\n", stderr);
    std::exit(1);
  }
  std::string result(length, '\0');
  if (!WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, -1, result.data(), length, nullptr, nullptr)) {
    std::fputs("Could not encode voice information as UTF-8\n", stderr);
    std::exit(1);
  }
  result.pop_back();
  return result;
}

static void json(const std::string& text) {
  std::putchar('"');
  for (const unsigned char c : text) {
    if (c == '"' || c == '\\') {
      std::putchar('\\');
      std::putchar(c);
    } else if (c < 0x20) {
      std::printf("\\u%04x", c);
    } else {
      std::putchar(c);
    }
  }
  std::putchar('"');
}

static void voices() {
  ComPtr<ISpObjectTokenCategory> category;
  check(CoCreateInstance(CLSID_SpObjectTokenCategory, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&category)),
        "Opening voice category");
  check(category->SetId(SPCAT_VOICES, FALSE), "Selecting voice category");
  ComPtr<IEnumSpObjectTokens> tokens;
  check(category->EnumTokens(nullptr, nullptr, &tokens), "Enumerating voices");
  std::putchar('[');
  bool first = true;
  while (true) {
    ComPtr<ISpObjectToken> token;
    ULONG fetched = 0;
    check(tokens->Next(1, &token, &fetched), "Reading a voice");
    if (!fetched) break;
    wchar_t* id = nullptr;
    wchar_t* name = nullptr;
    check(token->GetId(&id), "Reading voice ID");
    check(token->GetStringValue(nullptr, &name), "Reading voice name");
    if (!first) std::putchar(',');
    std::fputs("{\"id\":", stdout);
    json(utf8(id));
    std::fputs(",\"name\":", stdout);
    json(utf8(name));
    std::putchar('}');
    CoTaskMemFree(id);
    CoTaskMemFree(name);
    first = false;
  }
  std::fputs("]\n", stdout);
}

static void speak(const wchar_t* id, const wchar_t* output) {
  std::vector<char> input;
  char buffer[4096];
  for (size_t read; (read = std::fread(buffer, 1, sizeof(buffer), stdin)) != 0;)
    input.insert(input.end(), buffer, buffer + read);
  if (std::ferror(stdin) || input.empty()) {
    std::fputs("Could not read speech text\n", stderr);
    std::exit(1);
  }
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, input.data(),
                                         static_cast<int>(input.size()), nullptr, 0);
  if (!length) {
    std::fputs("Speech text is not valid UTF-8\n", stderr);
    std::exit(1);
  }
  std::wstring text(length, L'\0');
  if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, input.data(), static_cast<int>(input.size()),
                           text.data(), length)) {
    std::fputs("Could not decode speech text\n", stderr);
    std::exit(1);
  }
  ComPtr<ISpObjectToken> token;
  check(CoCreateInstance(CLSID_SpObjectToken, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&token)), "Opening voice token");
  check(token->SetId(nullptr, id, FALSE), "Opening voice");
  ComPtr<ISpVoice> voice;
  check(CoCreateInstance(CLSID_SpVoice, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&voice)), "Starting speech");
  check(voice->SetVoice(token.Get()), "Selecting voice");
  ComPtr<ISpStream> stream;
  check(CoCreateInstance(CLSID_SpStream, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&stream)), "Starting speech output");
  WAVEFORMATEX format = {WAVE_FORMAT_PCM, 1, 22050, 44100, 2, 16, 0};
  check(stream->BindToFile(output, SPFM_CREATE_ALWAYS, &SPDFID_WaveFormatEx, &format, 0), "Opening speech output");
  check(voice->SetOutput(stream.Get(), TRUE), "Setting speech output");
  check(voice->Speak(text.c_str(), SPF_IS_NOT_XML, nullptr), "Generating speech");
  check(stream->Close(), "Closing speech output");
}

static void transcribe(const wchar_t* input) {
  ComPtr<ISpStream> stream;
  check(CoCreateInstance(CLSID_SpStream, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&stream)), "Starting audio input");
  check(stream->BindToFile(input, SPFM_OPEN_READONLY, nullptr, nullptr, 0), "Opening audio input");
  ComPtr<ISpRecognizer> recognizer;
  check(CoCreateInstance(CLSID_SpInprocRecognizer, nullptr, CLSCTX_ALL, IID_PPV_ARGS(&recognizer)),
        "Starting recognition");
  check(recognizer->SetInput(stream.Get(), TRUE), "Setting recognition input");
  ComPtr<ISpRecoContext> context;
  check(recognizer->CreateRecoContext(&context), "Starting recognition context");
  check(context->SetNotifyWin32Event(), "Setting recognition notification");
  const ULONGLONG events = SPFEI(SPEI_RECOGNITION) | SPFEI(SPEI_END_SR_STREAM);
  check(context->SetInterest(events, events), "Selecting recognition events");
  ComPtr<ISpRecoGrammar> grammar;
  check(context->CreateGrammar(1, &grammar), "Creating dictation grammar");
  check(grammar->LoadDictation(nullptr, SPLO_STATIC), "Loading dictation grammar");
  check(grammar->SetDictationState(SPRS_ACTIVE), "Starting dictation");
  check(recognizer->SetRecoState(SPRST_ACTIVE_ALWAYS), "Starting recognition");
  std::string text;
  bool finished = false;
  while (!finished) {
    const HRESULT wait = context->WaitForNotifyEvent(30000);
    if (wait == S_FALSE) {
      std::fputs("Recognition timed out\n", stderr);
      std::exit(1);
    }
    check(wait, "Waiting for recognition");
    SPEVENT event = {};
    ULONG fetched = 0;
    while (true) {
      check(context->GetEvents(1, &event, &fetched), "Reading recognition events");
      if (!fetched) break;
      if (event.eEventId == SPEI_RECOGNITION) {
        wchar_t* result = nullptr;
        auto* phrase = reinterpret_cast<ISpRecoResult*>(event.lParam);
        check(phrase->GetText(static_cast<ULONG>(SP_GETWHOLEPHRASE), static_cast<ULONG>(SP_GETWHOLEPHRASE),
                              FALSE, &result, nullptr),
              "Reading recognition result");
        if (!text.empty()) text += " ";
        text += utf8(result);
        CoTaskMemFree(result);
      }
      if (event.eEventId == SPEI_END_SR_STREAM) finished = true;
      if (event.elParamType == SPET_LPARAM_IS_OBJECT || event.elParamType == SPET_LPARAM_IS_TOKEN)
        reinterpret_cast<IUnknown*>(event.lParam)->Release();
      if (event.elParamType == SPET_LPARAM_IS_POINTER || event.elParamType == SPET_LPARAM_IS_STRING)
        CoTaskMemFree(reinterpret_cast<void*>(event.lParam));
    }
  }
  json(text);
  std::putchar('\n');
}

int wmain(int argc, wchar_t** argv) {
  if (argc != 2 && argc != 3 && argc != 4) {
    std::fputs("Usage: accesscode-sapi voices | accesscode-sapi speak <voice-id> <output-wav> | accesscode-sapi transcribe <input-wav>\n", stderr);
    return 2;
  }
  check(CoInitializeEx(nullptr, COINIT_MULTITHREADED), "Initializing Windows speech");
  if (argc == 2 && std::wstring(argv[1]) == L"voices") voices();
  else if (argc == 4 && std::wstring(argv[1]) == L"speak") speak(argv[2], argv[3]);
  else if (argc == 3 && std::wstring(argv[1]) == L"transcribe") transcribe(argv[2]);
  else {
    std::fputs("Unknown speech command\n", stderr);
    CoUninitialize();
    return 2;
  }
  CoUninitialize();
  return 0;
}
