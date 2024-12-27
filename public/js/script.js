const socket = io(); // Connect to the Socket.IO server

// Store user locations and markers
const markers = {};
let userLocations = {};
let userId = localStorage.getItem("userId") || null;  // Retrieve stored userId if it exists

// Create map first with default position, then update when geolocation is available
const map = L.map("map").setView([0, 0], 16); // Default to 0, 0 if no location is found yet

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap",
}).addTo(map);

// Haversine Formula to calculate distance in kilometers
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const φ1 = lat1 * (Math.PI / 180); // Convert degrees to radians
    const φ2 = lat2 * (Math.PI / 180);
    const Δφ = (lat2 - lat1) * (Math.PI / 180); // Difference in latitudes
    const Δλ = (lon2 - lon1) * (Math.PI / 180); // Difference in longitudes

    // Haversine formula
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in kilometers
}

// Generate a random color for each user
function generateRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Fetch weather data for a given latitude and longitude
function fetchWeather(lat, lon) {
    const apiKey = '2733dee75e89c3a71f8cee76207b11f5'; // Your API key
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            const weatherDiv = document.getElementById('weather-info');
            weatherDiv.innerHTML = `
                <h3>Weather Information</h3>
                <p>Location: ${data.name}, ${data.sys.country}</p>
                <p>Temperature: ${data.main.temp}°C</p>
                <p>Weather: ${data.weather[0].description}</p>
                <p>Wind Speed: ${data.wind.speed} m/s</p>
                <p>Humidity: ${data.main.humidity}%</p>
            `;
            
            // Create the close button
            const closeButton = document.createElement('button');
            closeButton.innerHTML = 'Close';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '10px';
            closeButton.style.right = '10px';
            closeButton.style.backgroundColor = 'red';
            closeButton.style.color = 'white';
            closeButton.style.border = 'none';
            closeButton.style.padding = '5px 10px';
            closeButton.style.cursor = 'pointer';
            
            closeButton.addEventListener('click', () => {
                weatherDiv.style.display = 'none'; // Hide the weather div when clicked
            });

            // Append close button to the weather div
            weatherDiv.appendChild(closeButton);
            
            weatherDiv.style.display = 'block'; // Show the weather div
        })
        .catch(error => {
            console.error('Error fetching weather data:', error);
        });
}

// Initialize geolocation and update map view and markers
if (navigator.geolocation) {
    if (!userId) {
        // Generate a random userId if none exists
        userId = Math.random().toString(36).substring(2, 9);
        localStorage.setItem("userId", userId); // Store userId in localStorage
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;

        // Emit the location to the server with userId
        socket.emit("send-location", { latitude, longitude, userId });

        // Center the map on user's location
        map.setView([latitude, longitude], 16);

        // Start watching user's location
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                socket.emit("send-location", { latitude, longitude, userId });
            },
            (error) => {
                console.error(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );
    });
}

// Function to draw a dotted line between two users and show distance on hover
function drawDottedLine(user1, user2) {
    const latLngs = [user1, user2];
    if (latLngs.length === 2) {
        // Calculate distance using Haversine formula
        const distance = haversine(user1[0], user1[1], user2[0], user2[1]); // in kilometers

        const polyline = L.polyline(latLngs, {
            color: "red",
            weight: 3,
            opacity: 0.6,
            dashArray: "10,10", // Dotted line
        }).addTo(map);

        // Add a tooltip that displays the distance
        polyline.bindTooltip(`${distance.toFixed(2)} km`, { permanent: true, direction: 'center' });

        // Show tooltip when hovering over the line
        polyline.on('mouseover', () => {
            polyline.openTooltip();
        });
        polyline.on('mouseout', () => {
            polyline.closeTooltip();
        });
    }
}

// Handle the 'receive-location' event from the server
socket.on("receive-location", (data) => {
    const { id, latitude, longitude } = data;
    userLocations[id] = { latitude, longitude };

    // Assign a random color for each user
    const markerColor = generateRandomColor();  // Generate a random color

    // Update or add marker for the user
    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
    } else {
        markers[id] = L.marker([latitude, longitude], {
            icon: L.divIcon({
                className: "leaflet-div-icon",
                html: `<div style="background-color:${markerColor}; width: 20px; height: 20px; border-radius: 50%;"></div>`
            })
        }).addTo(map);

        // Add click event to each marker to fetch weather data
        markers[id].on('click', () => {
            fetchWeather(latitude, longitude); // Fetch weather on marker click
        });
    }

    // If there are at least two users, draw a dotted line
    const userIds = Object.keys(userLocations);
    if (userIds.length >= 2) {
        const user1 = userLocations[userIds[0]];
        const user2 = userLocations[userIds[1]];
        drawDottedLine([user1.latitude, user1.longitude], [user2.latitude, user2.longitude]);
    }
});

// Handle user disconnection
socket.on("user-disconnected", (id) => {
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
});

// Periodically refresh the user location every 5 seconds
setInterval(() => {
    if (userId) {
        navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords;
            socket.emit("send-location", { latitude, longitude, userId });
        });
    }
}, 5000);

// Add a disconnection prompt after 1 minute
setTimeout(() => {
    const userChoice = confirm("Do you want to stay connected or disconnect?");
    if (userChoice) {
        // Stay connected
        alert("You are staying connected.");
    } else {
        // Disconnect
        socket.emit("disconnect"); // Emit disconnection to the server
    }
}, 60000);
