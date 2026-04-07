// SPCMS Dashboard - Connected to AWS
// Configuration
const API_URL = 'https://p17u3hwz62.execute-api.us-east-1.amazonaws.com/prod/data';
const REFRESH_INTERVAL = 10000; // 10 seconds

// State
let chart = null;
let isConnected = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupChart();
    setupButtons();
    fetchDataAndUpdate();
    startAutoRefresh();
});

// Setup chart
function setupChart() {
    const ctx = document.getElementById('chart');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Moisture (%)',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    enabled: true
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Value'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            }
        }
    });
}

// Setup button clicks
function setupButtons() {
    document.getElementById('refreshBtn').onclick = () => {
        fetchDataAndUpdate();
        showMessage('Data refreshed! 🔄');
    };
}

// Fetch data from AWS API
async function fetchDataAndUpdate() {
    try {
        updateStatus('connecting');
        
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Update connection status
        isConnected = true;
        updateStatus('connected');
        
        // Update current readings
        updateCurrentReadings(data.current);
        
        // Update chart with history
        updateChartWithHistory(data.history);
        
        // Update alerts
        updateAlerts(data.alerts);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        isConnected = false;
        updateStatus('disconnected');
        showMessage('⚠️ Connection error: ' + error.message);
    }
}

// Update connection status indicator
function updateStatus(status) {
    const statusEl = document.getElementById('status');
    
    if (status === 'connected') {
        statusEl.textContent = '● Connected';
        statusEl.className = 'status';
        statusEl.style.background = '#10b981';
    } else if (status === 'connecting') {
        statusEl.textContent = '● Connecting...';
        statusEl.className = 'status';
        statusEl.style.background = '#f59e0b';
    } else {
        statusEl.textContent = '● Disconnected';
        statusEl.className = 'status';
        statusEl.style.background = '#ef4444';
    }
}

// Update current sensor readings
function updateCurrentReadings(current) {
    if (!current) return;
    
    document.getElementById('moisture').textContent = current.soil_moisture.toFixed(1) + '%';
    document.getElementById('temperature').textContent = current.temperature.toFixed(1) + '°C';
    document.getElementById('humidity').textContent = current.humidity.toFixed(0) + '%';
    document.getElementById('light').textContent = current.light_intensity.toFixed(0) + ' lux';
}

// Update chart with historical data
function updateChartWithHistory(history) {
    if (!history || history.length === 0) return;
    
    // Take last 20 data points
    const recentHistory = history.slice(-20);
    
    // Format timestamps
    const labels = recentHistory.map(item => {
        const date = new Date(item.timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit'
        });
    });
    
    // Extract data
    const moistureData = recentHistory.map(item => item.soil_moisture);
    const tempData = recentHistory.map(item => item.temperature);
    const humidityData = recentHistory.map(item => item.humidity);
    
    // Update chart
    chart.data.labels = labels;
    chart.data.datasets[0].data = moistureData;
    chart.data.datasets[1].data = tempData;
    chart.data.datasets[2].data = humidityData;
    chart.update('none');
}

// Update alerts display
function updateAlerts(alerts) {
    const container = document.getElementById('alerts');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="no-alerts">No alerts - system healthy! 🎉</div>';
        return;
    }
    
    // Take most recent 10 alerts
    const recentAlerts = alerts.slice(0, 10);
    
    container.innerHTML = recentAlerts.map(alert => {
        const timestamp = new Date(alert.timestamp).toLocaleString();
        const severityClass = alert.level.toLowerCase();
        
        return `
            <div class="alert-item ${severityClass}">
                <div class="alert-header">
                    <span class="alert-severity">${alert.level}</span>
                    <span class="alert-time">${timestamp}</span>
                </div>
                <div class="alert-details">
                    ${alert.alerts.map(a => `
                        <div class="alert-message">
                            <strong>${a.parameter}:</strong> ${a.message}
                        </div>
                    `).join('')}
                </div>
                <div class="alert-readings">
                    Readings: ${alert.readings.soil_moisture.toFixed(1)}% moisture, 
                    ${alert.readings.temperature.toFixed(1)}°C, 
                    ${alert.readings.humidity.toFixed(0)}% humidity, 
                    ${alert.readings.light_intensity.toFixed(0)} lux
                </div>
            </div>
        `;
    }).join('');
}

// Start auto-refresh
function startAutoRefresh() {
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            fetchDataAndUpdate();
        }
    }, REFRESH_INTERVAL);
}

// Show temporary message
function showMessage(text) {
    const msg = document.createElement('div');
    msg.textContent = text;
    msg.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;
    document.body.appendChild(msg);
    
    setTimeout(() => msg.remove(), 3000);
}