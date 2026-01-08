import { VoxCPMTtsProvider } from "./voxcpm.js";
import { registerTtsProvider } from "../../tts/index.js";

(function() {
    const PROVIDER_NAME = "VoxCPM";

    try {
        console.log("[VoxCPM] Attempting to register provider...");
        registerTtsProvider(PROVIDER_NAME, VoxCPMTtsProvider);
        console.log("[VoxCPM] Registered successfully.");
    } catch (e) {
        console.warn(`[VoxCPM] Registration failed (likely already registered): ${e.message}`);
    }
})();
