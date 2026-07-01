const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const Recording = require('../models/Recording.model');

/**
 * Compresses a video asynchronously
 * @param {string} inputPath Absolute path to the uploaded video
 * @param {string} recordingId ID of the Recording model to update status
 * @param {string} originalFileName The name of the original file
 */
const compressVideo = (inputPath, recordingId, originalFileName) => {
  return new Promise((resolve, reject) => {
    try {
      const ext = path.extname(inputPath);
      const outputName = originalFileName.replace(ext, `_compressed${ext}`);
      const outputPath = path.join(path.dirname(inputPath), outputName);

      ffmpeg(inputPath)
        .outputOptions([
          '-vcodec libx264',
          '-crf 28', // Higher CRF means lower quality, more compression. (default 23)
          '-preset veryfast', 
          '-s hd720', // Scale to 720p
        ])
        .on('start', (commandLine) => {
          console.log(`[FFmpeg] Spawned Ffmpeg with command: ${commandLine}`);
        })
        .on('progress', (progress) => {
          // Could technically update progress to DB or socket here
        })
        .on('end', async () => {
          console.log(`[FFmpeg] Compression finished for ${recordingId}`);
          try {
            // Delete original file
            if (fs.existsSync(inputPath)) {
              fs.unlinkSync(inputPath);
            }
            
            // Rename compressed file to original name
            fs.renameSync(outputPath, inputPath);

            // Update DB Status
            if (recordingId) {
              await Recording.findByIdAndUpdate(recordingId, { compressionStatus: 'completed' });
            }
            resolve(true);
          } catch (err) {
            console.error('[FFmpeg] Error finalizing file', err);
            if (recordingId) {
              await Recording.findByIdAndUpdate(recordingId, { compressionStatus: 'failed' });
            }
            resolve(false); // resolve false so it doesn't crash app
          }
        })
        .on('error', async (err) => {
          console.error(`[FFmpeg] Compression error:`, err);
          try {
            if (recordingId) {
              await Recording.findByIdAndUpdate(recordingId, { compressionStatus: 'failed' });
            }
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); // cleanup partial file
          } catch(dbErr) {}
          resolve(false);
        })
        .save(outputPath);
    } catch (err) {
      console.error('[FFmpeg] Setup error', err);
      if (recordingId) {
        Recording.findByIdAndUpdate(recordingId, { compressionStatus: 'failed' }).catch(console.error);
      }
      resolve(false);
    }
  });
};

module.exports = {
  compressVideo
};
