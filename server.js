require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

const PORT = 3000;

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection error:', err));

// ✅ Search Log Schema & Model (directly in this file)
const searchLogSchema = new mongoose.Schema({
  latitude: String,
  longitude: String,
  placeName: String,
  searchedAt: {
    type: Date,
    default: Date.now
  }
});
const SearchLog = mongoose.model('SearchLog', searchLogSchema);

// ✅ Home route (optional)
app.get('/', (req, res) => {
  res.send(`WeatherApp server running on port ${PORT}.`);
});

// ✅ Main Weather Route
app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Please provide latitude and longitude as query parameters.' });
  }

  const geocodeApiKey = process.env.GEOCODE_MAPS_CO_API_KEY;

  try {
    const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&forecast_days=3&timezone=GMT`;
    const geocodeApiUrl = `https://geocode.maps.co/reverse?lat=${lat}&lon=${lon}&api_key=${geocodeApiKey}`;

    const [weatherResponse, geocodeResponse] = await Promise.all([
      axios.get(weatherApiUrl),
      axios.get(geocodeApiUrl)
    ]);

    const weatherData = weatherResponse.data;
    const geocodeData = geocodeResponse.data;

    // ✅ Build Place Name
    let placeName = "Unknown Location";
    if (geocodeData && geocodeData.address) {
      const addr = geocodeData.address;
      if (addr.city && addr.country) placeName = `${addr.city}, ${addr.country}`;
      else if (addr.town && addr.country) placeName = `${addr.town}, ${addr.country}`;
      else if (addr.village && addr.country) placeName = `${addr.village}, ${addr.country}`;
      else if (addr.hamlet && addr.country) placeName = `${addr.hamlet}, ${addr.country}`;
      else if (addr.county && addr.country) placeName = `${addr.county}, ${addr.country}`;
      else if (geocodeData.display_name) {
        const parts = geocodeData.display_name.split(',');
        placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length - 1].trim()}` : geocodeData.display_name;
      }
    } else if (geocodeData && geocodeData.display_name) {
      const parts = geocodeData.display_name.split(',');
      placeName = parts.length > 1 ? `${parts[0].trim()}, ${parts[parts.length - 1].trim()}` : geocodeData.display_name;
    }

    // ✅ Save to MongoDB
    const log = new SearchLog({
      latitude: lat,
      longitude: lon,
      placeName: placeName
    });
    await log.save()
      .then(() => console.log('📦 Search saved to DB'))
      .catch(err => console.error('❌ DB save error:', err.message));

    // ✅ Prepare final response
    const combinedResponse = {
      location: {
        name: placeName,
        latitude: parseFloat(weatherData.latitude) || parseFloat(lat),
        longitude: parseFloat(weatherData.longitude) || parseFloat(lon)
      },
      currentWeather: weatherData.current,
      currentWeatherUnits: weatherData.current_units,
      dailyForecast: {
        time: weatherData.daily?.time?.slice(0, 2) || [],
        weather_code: weatherData.daily?.weather_code?.slice(0, 2) || [],
        temperature_2m_max: weatherData.daily?.temperature_2m_max?.slice(0, 2) || [],
        temperature_2m_min: weatherData.daily?.temperature_2m_min?.slice(0, 2) || [],
        sunrise: weatherData.daily?.sunrise?.slice(0, 2) || [],
        sunset: weatherData.daily?.sunset?.slice(0, 2) || []
      },
      dailyForecastUnits: weatherData.daily_units || {}
    };

    res.json(combinedResponse);

  } catch (error) {
    console.error("❌ Error in /weather route:", error.message);
    res.status(500).json({ error: 'Failed to process your request.', details: error.message });
  }
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
