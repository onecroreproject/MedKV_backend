const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const mergeSegments = (segmentPaths, outputPath) => {
  return new Promise((resolve, reject) => {
    if (!segmentPaths || segmentPaths.length === 0) {
      return reject(new Error('No segments provided'));
    }
    if (segmentPaths.length === 1) {
      // Just rename/copy the file
      try {
        fs.copyFileSync(segmentPaths[0], outputPath);
        return resolve(outputPath);
      } catch(err) {
        return reject(err);
      }
    }

    // Create concat text file
    const listFilePath = path.join(path.dirname(outputPath), `concat_list_${Date.now()}.txt`);
    
    // FFmpeg requires paths to be properly escaped or formatted. 
    // Format: file '/path/to/file1.mp4'
    const listContent = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    
    try {
      fs.writeFileSync(listFilePath, listContent);
    } catch(err) {
      return reject(new Error(`Failed to write concat list: ${err.message}`));
    }

    const command = `ffmpeg -y -f concat -safe 0 -i "${listFilePath}" -c copy "${outputPath}"`;
    
    exec(command, (error, stdout, stderr) => {
      try {
        fs.unlinkSync(listFilePath); // Cleanup list file
      } catch(e) {}
      
      if (error) {
        console.error('FFmpeg merge error:', stderr);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
};

module.exports = { mergeSegments };
