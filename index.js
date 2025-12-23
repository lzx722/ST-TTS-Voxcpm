import { registerTtsProvider } from "../../tts/index.js";
import { VoxCPMTtsProvider } from "./voxcpm-provider.js";

(function() {
    registerTtsProvider("VoxCPM", VoxCPMTtsProvider);
})();
