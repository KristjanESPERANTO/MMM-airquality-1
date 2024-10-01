Module.register("MMM-airquality", {
  defaults: {
    apiKey: "",           // Ambee API Key
    latitude: "",         // Latitude of your location
    longitude: "",        // Longitude of your location
    updateInterval: 900000, // Update every 15 minutes (max 96 calls/day)
    animationSpeed: 1000, // Animation speed in milliseconds
    units: "si",          // Units to be passed to API (e.g., si for Celsius)
    showPollenForecast: true, // Option to control pollen forecast display
    showPM10: true,       // Option to show or hide PM10
    showPM25: true,       // Option to show or hide PM2.5
    debug: false,
  },

  start() {
    Log.info(`[MMM-airquality] Starting module: ${this.name}`);
    this.loaded = false;
    this.pollenData = null;
    this.airQualityData = null;
    this.pollenForecastData = null;
    this.scheduleUpdate();
    this.updateTimer = null;

    if (this.config.debug) {
      Log.info("[MMM-airquality] Debug mode ON");
    }
    Log.info("[MMM-airquality] Initializing data fetch...");
    this.updateData(this);
  },

  updateData(self) {
    Log.info("[MMM-airquality] Sending socket notification to fetch data...");
    self.sendSocketNotification("GET_DATA", {
      apiKey: self.config.apiKey,
      latitude: self.config.latitude,
      longitude: self.config.longitude,
      units: self.config.units
    });
  },

  getStyles() {
    return ["MMM-airquality.css"];
  },

  getDom() {
    const wrapper = document.createElement("div");

    if (!this.loaded) {
      wrapper.innerHTML = "Loading data...";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    if (!this.pollenData || !this.airQualityData || !this.pollenForecastData) {
      wrapper.innerHTML = "No data available.";
      wrapper.className = "dimmed light small";
      return wrapper;
    }

    const mainWrapper = document.createElement("div");

    // Row 1: City, AQI, and Particulate Matter (PM10, PM2.5 if enabled)
    const cityAqi = document.createElement("div");
    cityAqi.className = "city-aqi bright medium light";
    const city = this.airQualityData.city || "Unknown Location";
    const aqi = this.airQualityData.AQI || "N/A";
    const aqiCategory = (this.airQualityData.aqiInfo && this.airQualityData.aqiInfo.category) || "N/A";

    let additionalInfo = "";

    // Check if PM10 data is available before showing it
    if (this.config.showPM10 && this.airQualityData.PM10 !== undefined && this.airQualityData.PM10 !== null) {
      const pm10 = `PM10: ${this.airQualityData.PM10}`;
      additionalInfo += ` | ${pm10}`;
    } else if (this.config.showPM10) {
      additionalInfo += " | PM10: N/A";
    }

    // Check if PM2.5 data is available before showing it
    if (this.config.showPM25 && this.airQualityData.PM25 !== undefined && this.airQualityData.PM25 !== null) {
      const pm25 = `PM2.5: ${this.airQualityData.PM25}`;
      additionalInfo += ` | ${pm25}`;
    } else if (this.config.showPM25) {
      additionalInfo += " | PM2.5: N/A";
    }

    cityAqi.innerHTML = `${city} | AQI ${aqi} (${aqiCategory})${additionalInfo}`;
    mainWrapper.appendChild(cityAqi);

    // Row 2: "Pollen count"
    const pollenCountTitle = document.createElement("div");
    pollenCountTitle.className = "pollen-count-title small bright";
    pollenCountTitle.innerHTML = "Pollen count";
    mainWrapper.appendChild(pollenCountTitle);

    // Row 3 & 4: Today's pollen counts and species
    const pollenCounts = document.createElement("div");
    pollenCounts.className = "pollen-counts small bright";

    const counts = this.pollenData.Count;
    const risks = this.pollenData.Risk;
    const species = this.pollenData.Species;

    const sources = ["grass_pollen", "tree_pollen", "weed_pollen"];
    const sourceToSpeciesMap = {
      'grass_pollen': 'Grass',
      'tree_pollen': 'Tree',
      'weed_pollen': 'Weed'
    };

    sources.forEach(source => {
      if (counts[source] && counts[source] > 0) {
        const sourceDiv = document.createElement("div");
        sourceDiv.className = "pollen-source";

        // Source name (capitalize)
        const sourceName = source.replace('_pollen', '').replace(/\b\w/g, l => l.toUpperCase());

        sourceDiv.innerHTML = `${sourceName}: ${counts[source]} (${risks[source]})`;
        pollenCounts.appendChild(sourceDiv);

        // Species under this source
        const speciesKey = sourceToSpeciesMap[source];
        const speciesList = species[speciesKey];
        if (speciesList) {
          const speciesDiv = document.createElement("div");
          speciesDiv.className = "pollen-species xsmall dimmed";

          let speciesHTML = '';
          for (let sp in speciesList) {
            if (speciesList[sp] > 0) {
              speciesHTML += `${sp}: ${speciesList[sp]}<br>`;
            }
          }
          speciesDiv.innerHTML = speciesHTML;
          pollenCounts.appendChild(speciesDiv);
        }
      }
    });

    mainWrapper.appendChild(pollenCounts);

    // Conditionally show the pollen forecast
    if (this.config.showPollenForecast) {
      // Separator line
      const separator = document.createElement("hr");
      separator.className = "separator";
      mainWrapper.appendChild(separator);

      // Pollen Forecast
      const forecastTitle = document.createElement("div");
      forecastTitle.className = "forecast-title small bright";
      forecastTitle.innerHTML = "Pollen Forecast";
      mainWrapper.appendChild(forecastTitle);

      // Display forecast in a table
      const forecastTable = document.createElement("table");
      forecastTable.className = "forecast-table small";

      // Table Header
      const headerRow = document.createElement("tr");
      const dayHeader = document.createElement("th");
      dayHeader.innerHTML = "Day";
      const pollenTypeHeader = document.createElement("th");
      pollenTypeHeader.innerHTML = "Pollen Type";
      const riskHeader = document.createElement("th");
      riskHeader.innerHTML = "Risk Level";
      const countHeader = document.createElement("th");
      countHeader.innerHTML = "Count";

      headerRow.appendChild(dayHeader);
      headerRow.appendChild(pollenTypeHeader);
      headerRow.appendChild(riskHeader);
      headerRow.appendChild(countHeader);
      forecastTable.appendChild(headerRow);

      // Process forecast data
      const forecastData = this.processForecastData(this.pollenForecastData);

      forecastData.forEach(dayData => {
        const row = document.createElement("tr");
        row.className = "forecast-row";

        // Weekday (Today, Tomorrow, Weekdays)
        const dayCell = document.createElement("td");
        dayCell.innerHTML = dayData.weekday;
        row.appendChild(dayCell);

        // Since there may be multiple pollen types with the highest count, we'll only display the first one
        const highestPollenType = dayData.highestPollenTypes[0];

        // Pollen Type
        const pollenTypeCell = document.createElement("td");
        pollenTypeCell.innerHTML = highestPollenType.source;
        row.appendChild(pollenTypeCell);

        // Risk Level
        const riskCell = document.createElement("td");
        riskCell.innerHTML = highestPollenType.risk;
        row.appendChild(riskCell);

        // Count
        const countCell = document.createElement("td");
        countCell.innerHTML = highestPollenType.count;
        row.appendChild(countCell);

        forecastTable.appendChild(row);
      });

      mainWrapper.appendChild(forecastTable);
    }

    wrapper.appendChild(mainWrapper);
    return wrapper;
  },

  processForecastData(forecastData) {
    const dayMap = {};

    forecastData.forEach(entry => {
      const time = entry.time;
      const date = new Date(time * 1000);
      const day = date.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }); // Use default system locale

      if (!dayMap[day]) {
        dayMap[day] = {
          date: date,
          countsList: {
            grass_pollen: [],
            tree_pollen: [],
            weed_pollen: []
          },
          risksList: {
            grass_pollen: [],
            tree_pollen: [],
            weed_pollen: []
          }
        };
      }

      // Collect counts
      dayMap[day].countsList.grass_pollen.push(entry.Count.grass_pollen || 0);
      dayMap[day].countsList.tree_pollen.push(entry.Count.tree_pollen || 0);
      dayMap[day].countsList.weed_pollen.push(entry.Count.weed_pollen || 0);

      // Collect risk levels
      dayMap[day].risksList.grass_pollen.push(entry.Risk.grass_pollen);
      dayMap[day].risksList.tree_pollen.push(entry.Risk.tree_pollen);
      dayMap[day].risksList.weed_pollen.push(entry.Risk.weed_pollen);
    });

    const dayArray = Object.values(dayMap).sort((a, b) => a.date - b.date);

    // Add logic to ensure first day is Today, second day is Tomorrow, and the rest follow as weekdays.
    const forecastDataProcessed = dayArray.map((dayData, index) => {
      const countsList = dayData.countsList;
      const risksList = dayData.risksList;

      // Calculate average counts
      const counts = {
        grass_pollen: this.average(countsList.grass_pollen),
        tree_pollen: this.average(countsList.tree_pollen),
        weed_pollen: this.average(countsList.weed_pollen)
      };

      // Determine the highest risk level per pollen type for the day
      const riskLevelsOrder = ["Low", "Moderate", "High", "Very High"];
      const risks = {
        grass_pollen: this.highestRisk(risksList.grass_pollen, riskLevelsOrder),
        tree_pollen: this.highestRisk(risksList.tree_pollen, riskLevelsOrder),
        weed_pollen: this.highestRisk(risksList.weed_pollen, riskLevelsOrder)
      };

      // Find the pollen type(s) with the highest average count
      const maxCount = Math.max(counts.grass_pollen, counts.tree_pollen, counts.weed_pollen);

      const highestPollenTypes = [];
      ["grass_pollen", "tree_pollen", "weed_pollen"].forEach(source => {
        if (counts[source] === maxCount && counts[source] > 0) {
          highestPollenTypes.push({
            source: source.replace('_pollen', '').replace(/\b\w/g, l => l.toUpperCase()),
            risk: risks[source],
            count: Math.round(counts[source])
          });
        }
      });

      // Label the days as "Today", "Tomorrow", and then regular weekdays
      let weekday;
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      if (dayData.date.toDateString() === today.toDateString()) {
        weekday = "Today";
      } else if (dayData.date.toDateString() === tomorrow.toDateString()) {
        weekday = "Tomorrow";
      } else {
        weekday = dayData.date.toLocaleDateString(undefined, { weekday: 'long' }); // Use system locale for the weekday name
      }

      return {
        weekday: weekday,
        highestPollenTypes: highestPollenTypes
      };
    });

    return forecastDataProcessed;
  },

  // Helper function to calculate average
  average(arr) {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
  },

  // Helper function to determine the highest risk level
  highestRisk(risksArray, riskLevelsOrder) {
    let highestRisk = "Low";
    risksArray.forEach(risk => {
      if (riskLevelsOrder.indexOf(risk) > riskLevelsOrder.indexOf(highestRisk)) {
        highestRisk = risk;
      }
    });
    return highestRisk;
  },

  processAirQuality(data) {
    Log.info("[MMM-airquality] Air quality data received");
    this.airQualityData = data;
    this.checkIfDataLoaded();
  },

  processPollen(data) {
    Log.info("[MMM-airquality] Pollen data received");
    Log.debug("[MMM-airquality] Pollen data payload:", data);

    // Assuming data.data is an array, take the first element
    if (data.data && data.data.length > 0) {
      this.pollenData = data.data[0];
    } else {
      Log.error("[MMM-airquality] Pollen data is empty");
      this.pollenData = {};
    }
    this.checkIfDataLoaded();
  },

  processPollenForecast(data) {
    Log.info("[MMM-airquality] Pollen forecast data received");
    this.pollenForecastData = data;
    this.checkIfDataLoaded();
  },

  checkIfDataLoaded() {
    if (this.airQualityData && this.pollenData && this.pollenForecastData) {
      Log.info("[MMM-airquality] All data loaded, updating DOM");
      this.loaded = true;
      this.updateDom(this.config.animationSpeed);
      // Schedule the next update after the data is fully loaded
      this.scheduleUpdate();
    } else {
      Log.info("[MMM-airquality] Data still loading...");
    }
  },

  scheduleUpdate(delay = null) {
    const nextLoad = delay !== null ? delay : this.config.updateInterval;

    const self = this;
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      Log.info("[MMM-airquality] Scheduling next data fetch");
      self.updateData(self);
    }, nextLoad);
  },

  socketNotificationReceived(notification, payload) {
    Log.info(`[MMM-airquality] Socket notification received: ${notification}`);
    Log.debug(`[MMM-airquality] Payload for ${notification}:`, payload);
    if (notification === "AIR_QUALITY_RESULT") {
      this.processAirQuality(payload.data);
    } else if (notification === "POLLEN_RESULT") {
      this.processPollen(payload.data);
    } else if (notification === "POLLEN_FORECAST_RESULT") {
      this.processPollenForecast(payload.data);
    }
  }
});