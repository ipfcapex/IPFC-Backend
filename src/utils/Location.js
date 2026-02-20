// utils/geocode.js
const axios = require("axios");

// Convert decimal degrees to DMS
const toDMS = (decimal) => {
  const deg = Math.floor(decimal);
  const minFloat = (decimal - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(2);
  return `${deg}°${min}'${sec}"`;
};

exports.getLocationFromCoordinates = async (latitude, longitude) => {
  try {
    // Nominatim reverse geocoding URL
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "YourAppName" // Required by Nominatim
      }
    });

    const data = response.data;

    const city = data.address.city || data.address.town || data.address.village || "";
    const area = data.address.suburb || data.address.neighbourhood || "";
    const fullAddress = data.display_name || "";

    // ✅ Convert to DMS
    const latitudeDMS = toDMS(latitude);
    const longitudeDMS = toDMS(longitude);

    return { 
      city, 
      area, 
      fullAddress,
      latitudeDMS,
      longitudeDMS
    };
  } catch (error) {
    console.error("Reverse Geocoding Error:", error.message);
    return { city: "", area: "", fullAddress: "", latitudeDMS: "", longitudeDMS: "" };
  }
};
