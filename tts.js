// tts.js - Google Cloud Text-to-Speech conversion logic

const textToSpeech = require('@google-cloud/text-to-speech');
const { uploadFile } = require('./firebase');

// Initialize TTS client with service account
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const client = new textToSpeech.TextToSpeechClient({
    credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
    }
});

// Main conversion function
async function convertTextToAudio(text, fileName, voiceName = "en-US-Wavenet-D") {
    try {
        // Configure the TTS request
        const request = {
            input: { text },
            voice: {
                name: voiceName,
                languageCode: voiceName.split("-").slice(0, 2).join("-") // "en-GB"
            },

            audioConfig: {
                audioEncoding: 'MP3',
                effectsProfileId: ['small-bluetooth-speaker-class-device'],
                pitch: 0,
                speakingRate: 1.0
            }
        };

        console.log(`Converting text to audio: ${text.substring(0, 50)}...`);

        // Call Google TTS API
        const [response] = await client.synthesizeSpeech(request);

        // Get audio content (buffer)
        const audioBuffer = response.audioContent;

        console.log(`Audio generated successfully, size: ${audioBuffer.length} bytes`);
        return audioBuffer;

    } catch (error) {
        console.error('Error converting text to audio:', error);
        throw error;
    }
}

// Helper function to save audio file to Firebase Storage
async function saveAudioFile(audioBuffer, fileName) {
    try {
        console.log(`Saving audio file: ${fileName}`);

        // Upload to Firebase Storage using your firebase.js function
        const audioUrl = await uploadFile(fileName, audioBuffer, 'audio/mpeg');

        console.log(`Audio file saved successfully: ${audioUrl}`);
        return audioUrl;

    } catch (error) {
        console.error('Error saving audio file:', error);
        throw error;
    }
}

// Combined function - convert text and save to storage
async function convertAndSaveAudio(text, fileName) {
    try {
        // Step 1: Convert text to audio buffer
        const audioBuffer = await convertTextToAudio(text, fileName);

        // Step 2: Save audio buffer to Firebase Storage
        const audioUrl = await saveAudioFile(audioBuffer, fileName);

        return {
            success: true,
            audioUrl: audioUrl,
            fileName: fileName,
            audioSize: audioBuffer.length
        };

    } catch (error) {
        console.error('Error in convert and save process:', error);
        throw error;
    }
}

module.exports = { convertTextToAudio, saveAudioFile, convertAndSaveAudio };