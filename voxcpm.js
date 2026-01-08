import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/+esm";
import { extension_settings } from "../../../extensions.js";
import { saveTtsProviderSettings } from "../../tts/index.js";

export { VoxCPMTtsProvider };

class VoxCPMTtsProvider {
  settings;
  ready = false;
  voices = [];
  separator = ". ";
  splitMarker = "###SPLIT###";
  originalGlobalSettings = {};

  defaultSettings = {
    provider_endpoint: "http://localhost:7861",
    speed: 1.0,
    only_brackets: false,
    ignore_asterisks: false,
  };

  get settingsHtml() {
    return `
        <label for="voxcpm_endpoint">Provider Endpoint:</label>
        <input id="voxcpm_endpoint" type="text" class="text_pole" value="${this.defaultSettings.provider_endpoint}"/>
        <label for="voxcpm_speed">Speed:</label>
        <input id="voxcpm_speed" type="number" step="0.1" class="text_pole" value="${this.defaultSettings.speed}"/>
        `;
  }

  onSettingsChange() {
    this.settings.provider_endpoint = $("#voxcpm_endpoint").val();
    this.settings.speed = Number($("#voxcpm_speed").val());
    this.settings.only_brackets = $("#voxcpm_only_brackets").is(":checked");
    this.settings.ignore_asterisks = $("#voxcpm_ignore_asterisks").is(
      ":checked"
    );
    saveTtsProviderSettings();
  }

  async loadSettings(settings) {
    this.settings = { ...this.defaultSettings, ...settings };
    $("#voxcpm_endpoint").val(this.settings.provider_endpoint);
    $("#voxcpm_speed").val(this.settings.speed);

    // Attach event listeners
    $("#voxcpm_endpoint").on("change", () => this.onSettingsChange());
    $("#voxcpm_speed").on("change", () => this.onSettingsChange());

    this.applyUiCustomizations();
    await this.checkReady();
  }

  applyUiCustomizations() {
    // Hide unwanted global settings
    const selectorsToHide = [
      'label[for="tts_narrate_by_paragraphs"]',
      'label[for="tts_narrate_quoted"]',
      'label[for="tts_narrate_dialogues"]',
      'label[for="tts_narrate_translated_only"]',
      'label[for="tts_skip_codeblocks"]',
      'label[for="tts_skip_tags"]',
      'label[for="tts_pass_asterisks"]',
      'label[for="tts_multi_voice_enabled"]',
    ];
    $(selectorsToHide.join(",")).hide();

    // Rename "Narrate by paragraphs (when streaming)"
    const streamingLabel = $('label[for="tts_periodic_auto_generation"] small');
    if (streamingLabel.length) {
      if (!streamingLabel.data("original-text")) {
        streamingLabel.data("original-text", streamingLabel.text());
      }
      streamingLabel.text("生成时朗读（流式播放时，减少加载时间）");
    }

    // Inject custom checkboxes into the global settings area
    const container = $("#tts_enabled").closest("div");

    if ($("#voxcpm_only_brackets").length === 0) {
      const onlyBracketsHtml = `
        <label class="checkbox_label" for="voxcpm_only_brackets">
            <input type="checkbox" id="voxcpm_only_brackets">
            <small>Only read text in 「」（可以和上面的流式输出时朗读联动）</small>
        </label>
        `;
      container.append(onlyBracketsHtml);
      $("#voxcpm_only_brackets").on("change", () => this.onSettingsChange());
    }

    if ($("#voxcpm_ignore_asterisks").length === 0) {
      const ignoreAsterisksHtml = `
        <label class="checkbox_label" for="voxcpm_ignore_asterisks">
            <input type="checkbox" id="voxcpm_ignore_asterisks">
            <small>不朗读所有*星号内文本*，即使其被「」包裹</small>
        </label>
        `;
      container.append(ignoreAsterisksHtml);
      $("#voxcpm_ignore_asterisks").on("change", () => this.onSettingsChange());
    }

    // Set values
    $("#voxcpm_only_brackets").prop("checked", this.settings.only_brackets);
    $("#voxcpm_ignore_asterisks").prop(
      "checked",
      this.settings.ignore_asterisks
    );

    // Force pass_asterisks to true so we can handle text processing
    this.originalGlobalSettings.pass_asterisks =
      extension_settings.tts.pass_asterisks;
    extension_settings.tts.pass_asterisks = true;
  }

  restoreUiCustomizations() {
    // Show hidden settings
    const selectorsToHide = [
      'label[for="tts_narrate_by_paragraphs"]',
      'label[for="tts_narrate_quoted"]',
      'label[for="tts_narrate_dialogues"]',
      'label[for="tts_narrate_translated_only"]',
      'label[for="tts_skip_codeblocks"]',
      'label[for="tts_skip_tags"]',
      'label[for="tts_pass_asterisks"]',
      'label[for="tts_multi_voice_enabled"]',
    ];
    $(selectorsToHide.join(",")).show();

    // Restore label text
    const streamingLabel = $('label[for="tts_periodic_auto_generation"] small');
    if (streamingLabel.length && streamingLabel.data("original-text")) {
      streamingLabel.text(streamingLabel.data("original-text"));
    }

    // Remove custom checkboxes
    $('label[for="voxcpm_only_brackets"]').remove();
    $('label[for="voxcpm_ignore_asterisks"]').remove();

    // Restore global settings
    if (this.originalGlobalSettings.pass_asterisks !== undefined) {
      extension_settings.tts.pass_asterisks =
        this.originalGlobalSettings.pass_asterisks;
    }
  }

  dispose() {
    this.restoreUiCustomizations();
  }

  async checkReady() {
    try {
      await fetch(this.settings.provider_endpoint, {
        method: "HEAD",
        mode: "no-cors",
      });
      this.ready = true;
    } catch (e) {
      console.warn("VoxCPM checkReady failed", e);
    }
  }

  async onRefreshClick() {
    await this.fetchTtsVoiceObjects();
  }

  async getVoice(voiceName) {
    if (this.voices.length === 0) {
      await this.fetchTtsVoiceObjects();
    }
    let match = this.voices.find((v) => v.name === voiceName);

    // Fix for potential double voice ID issue (e.g. "Name,Name")
    if (!match && voiceName.includes(",")) {
      const parts = voiceName.split(",");
      // Check if all parts are the same (e.g. "Alice,Alice")
      if (parts.length > 1 && parts.every((p) => p === parts[0])) {
        const potentialName = parts[0];
        match = this.voices.find((v) => v.name === potentialName);
        if (match) {
          console.log(
            `VoxCPM: Detected duplicated voice name "${voiceName}", using "${potentialName}" instead.`
          );
        }
      }
    }

    if (!match) {
      return { name: voiceName, voice_id: voiceName };
    }
    return match;
  }

  async fetchTtsVoiceObjects() {
    try {
      const client = await Client.connect(this.settings.provider_endpoint);
      let choices = [];

      if (client.config && client.config.components) {
        const dropdown = client.config.components.find(
          (c) => c.props.label === "音色列表"
        );
        if (dropdown && dropdown.props.choices) {
          choices = dropdown.props.choices;
        }
      }

      if (choices.length === 0) {
        choices = ["Default"];
      }

      this.voices = choices.map((c) => ({ name: c, voice_id: c }));
      return this.voices;
    } catch (e) {
      console.error("VoxCPM fetch voices failed", e);
      return [];
    }
  }

  async generateAudioUrl(text, voiceId) {
    try {
      // Double check voiceId before sending
      if (
        voiceId.includes(",") &&
        !this.voices.find((v) => v.voice_id === voiceId)
      ) {
        const parts = voiceId.split(",");
        if (parts.length > 1 && parts.every((p) => p === parts[0])) {
          voiceId = parts[0];
        }
      }

      if (!text || !text.trim()) {
        return null;
      }

      const client = await Client.connect(this.settings.provider_endpoint);

      const result = await client.predict("/do_job", {
        voices_dropdown: voiceId,
        text: text,
        prompt_text: "Hello!!",
        prompt_audio: null,
        speed: this.settings.speed,
      });

      if (result.data && result.data[0]) {
        return result.data[0].url;
      }
      throw new Error("No audio data in response");
    } catch (e) {
      console.error("VoxCPM generation failed", e);
      throw e;
    }
  }

  async generateTts(text, voiceId) {
    if (text.includes(this.splitMarker)) {
      const parts = text.split(this.splitMarker);
      const self = this;
      return (async function* () {
        for (const part of parts) {
          if (!part.trim()) continue;
          const url = await self.generateAudioUrl(part, voiceId);
          if (url) yield url;
        }
      })();
    }

    return await this.generateAudioUrl(text, voiceId);
  }

  processText(text) {
    let processedText = text;

    if (this.settings.only_brackets) {
      // Match content inside 「 and 」
      const matches = text.match(/「([^」]*)」/g);
      if (matches && matches.length > 0) {
        // Extract content, remove brackets and join with split marker
        processedText = matches
          .map((m) => m.slice(1, -1))
          .join(this.splitMarker);
      } else {
        console.log("VoxCPM: No text in brackets found, skipping.");
        return ""; // Return empty string to skip generation
      }
    }

    if (this.settings.ignore_asterisks) {
      // Remove *...* content
      if (processedText.includes(this.splitMarker)) {
        const parts = processedText.split(this.splitMarker);
        processedText = parts
          .map((p) => p.replace(/\*[^*]*\*/g, "").trim())
          .filter((p) => p)
          .join(this.splitMarker);
      } else {
        processedText = processedText.replace(/\*[^*]*\*/g, "").trim();
      }
    }

    return processedText;
  }
}
