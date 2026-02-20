const Jimp = require("jimp");
const QrCodes = require("qrcode-reader");
const sharp = require("sharp");
const jsQR = require("jsqr");


//Decode at production
const debugDecodeQRatproduction  = async (base64Image) => {
  return new Promise(async (resolve, reject) => {
    try {
      
      const base64Data = base64Image.includes(",")
        ? base64Image.split(",")[1]
        : base64Image;

      const buffer = Buffer.from(base64Data, "base64");
      const image = await Jimp.read(buffer);
      image.greyscale().contrast(0.3);

      const qr = new QrCodes();
      qr.callback = (err, value) => {
        if (err || !value?.result) {
          return reject(new Error("QR decoding failed: " + (err?.message || "Unknown error")));
        }
        resolve(value.result);
      };

      qr.decode(image.bitmap);
    } catch (err) {
      reject(new Error("Failed to decode QR: " + err.message));
    }
  });
};

// Fallback decode using Sharp + jsQR
const fallbackDecodeQRatproduction  = async (base64Image) => {
  try {
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;
    const buffer = Buffer.from(base64Data, "base64");

    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const code = jsQR(data, info.width, info.height);
    if (code && code.data) return code.data;

    throw new Error("jsQR failed to find QR code");
  } catch (err) {
    throw new Error("Fallback decode failed: " + err.message);
  }
};

// Main exported function: Try both methods
exports.decodeBase64Qratproduction = async (base64Image) => {
  try {
    return await  debugDecodeQRatproduction (base64Image);
  } catch (err) {
    try {
      return await fallbackDecodeQRatproduction(base64Image);
    } catch (fallbackError) {
      throw new Error("All QR decode methods failed: " + fallbackError.message);
    }
  }
};


// Debug decoder at Warehouse
const debugDecodeQR = async (base64Image) => {
  return new Promise(async (resolve, reject) => {
    try {
      let base64Data = base64Image.includes(",")
        ? base64Image.split(",")[1]
        : base64Image;
      const buffer = Buffer.from(base64Data, "base64");

      const image = await Jimp.read(buffer);
      image.greyscale().contrast(0.3);

      const qr = new QrCodes();
      qr.callback = (err, value) => {
        if (err || !value?.result) {
          return reject(
            new Error(
              "QR decoding failed: " + (err?.message || "Unknown error")
            )
          );
        }
        resolve(value.result);
      };

      qr.decode(image.bitmap);
    } catch (err) {
      reject(new Error("Failed to decode QR: " + err.message));
    }
  });
};

// Fallback method
const fallbackDecodeQR = async (base64Image) => {
  try {
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;
    const buffer = Buffer.from(base64Data, "base64");

    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const code = jsQR(data, info.width, info.height);
    if (code && code.data) return code.data;

    throw new Error("jsQR failed to find QR code");
  } catch (err) {
    throw new Error("Fallback decode failed: " + err.message);
  }
};

// Combined decode
exports.decodeBase64Qr = async (base64Image) => {
  try {
    return await debugDecodeQR(base64Image);
  } catch (err) {
    try {
      return await fallbackDecodeQR(base64Image);
    } catch (fallbackError) {
      throw new Error("All QR decode methods failed: " + fallbackError.message);
    }
  }
};

