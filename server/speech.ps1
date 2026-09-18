$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Speech
    Add-Type -ReferencedAssemblies System.Speech -TypeDefinition @'
using System;
using System.Speech.Synthesis;
public static class SpeechFeedback {
    public static void Attach(SpeechSynthesizer voice) {
        voice.SpeakCompleted += (sender, e) => Console.WriteLine(e.Error != null ? "{\"type\":\"playback-error\"}" : e.Cancelled ? "{\"type\":\"cancelled\"}" : "{\"type\":\"completed\"}");
    }
}
'@
    $voice = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    [SpeechFeedback]::Attach($voice)
    $chinese = @($voice.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh-*' })
    if ($chinese.Count -gt 0) { $voice.SelectVoice($chinese[0].VoiceInfo.Name) }
    [Console]::WriteLine((@{ type = 'ready'; voice = $voice.Voice.Name; chinese = ($chinese.Count -gt 0) } | ConvertTo-Json -Compress))
    while ($null -ne ($line = [Console]::ReadLine())) {
        try {
            $message = $line | ConvertFrom-Json
            $voice.SpeakAsyncCancelAll()
            $culture = if ($message.language -eq 'en-US') { 'en-*' } else { 'zh-*' }
            $selected = @($voice.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like $culture })
            if ($selected.Count -gt 0) { $voice.SelectVoice($selected[0].VoiceInfo.Name) }
            if ($message.text) { $null = $voice.SpeakAsync([string]$message.text) }
        } catch { [Console]::WriteLine((@{ type = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress)) }
    }
    $voice.Dispose()
} catch { [Console]::WriteLine((@{ type = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress)); exit 1 }
