// SPCMS Data Processor Lambda Function
// Smart Plant Care Monitoring System

// Purpose:
// - Process incoming sensor data from IoT Core
// - Check thresholds for alerts
// - Store data in DynamoDB
// - Trigger SNS notifications for critical conditions

const AWS = require('aws-sdk');

// Initialize AWS services
const dynamo = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const iot = new AWS.IotData({ 
    endpoint: 'ab1j9yleosmq8-ats.iot.us-east-1.amazonaws.com'
});

// Configuration
const SENSOR_DATA_TABLE = 'SPCMS_SensorData';
const ALERT_HISTORY_TABLE = 'SPCMS_AlertHistory';
const SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:748331511943:SPCMS_Alerts';

// Threshold definitions
const THRESHOLDS = {
    soilMoisture: {
        critical: 20,    // Below 20% = critical (plant dying)
        warning: 35,     // Below 35% = warning (needs water soon)
        optimal: 60      // 40-80% = optimal range
    },
    temperature: {
        min: 15,         // Below 15°C = too cold
        max: 35,         // Above 35°C = too hot
        optimal: 25      // 20-30°C = optimal
    },
    humidity: {
        min: 40,         // Below 40% = too dry
        max: 80,         // Above 80% = too humid
        optimal: 60      // 50-70% = optimal
    },
    lightIntensity: {
        min: 200,        // Below 200 lux = too dark
        optimal: 1000,   // 500-2000 lux = optimal for most plants
        max: 50000       // Above 50000 lux = potential burn
    }
};

exports.handler = async (event) => {
    console.log('📨 Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Extract sensor data from event
        console.log('📨 Raw event received:', JSON.stringify(event, null, 2));
        
        const sensorData = {
            device_id: event.device_id || 'device-001',
            timestamp: event.timestamp || new Date().toISOString(),
            soil_moisture: parseFloat(event.soil_moisture) || 0,
            temperature: parseFloat(event.temperature) || 0,
            humidity: parseFloat(event.humidity) || 0,
            light_intensity: parseFloat(event.light_intensity) || 0
        };
        
        console.log('📊 Parsed sensor data:', sensorData);
        
        // More lenient validation - just check if values exist
        if (sensorData.soil_moisture === 0 && 
            sensorData.temperature === 0 && 
            sensorData.humidity === 0 && 
            sensorData.light_intensity === 0) {
            console.log('⚠️ Warning: All sensor values are zero');
        }
        
        // Step 1: Check thresholds and determine alert level
        const alerts = checkThresholds(sensorData);
        const alertLevel = determineAlertLevel(alerts);
        
        // Step 2: Save sensor data to DynamoDB
        await saveSensorData(sensorData);
        console.log('✅ Sensor data saved to DynamoDB');
        
        // Step 3: If alerts exist, save alert and send SNS notification
        if (alerts.length > 0) {
            console.log(`⚠️  ${alertLevel} alert triggered:`, alerts);
            
            // Save alert to history
            await saveAlert(sensorData, alerts, alertLevel);
            console.log('✅ Alert saved to history');
            
            // Send SNS notification
            await sendSNSAlert(sensorData, alerts, alertLevel);
            console.log('✅ SNS notification sent');
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Data processed successfully',
                device_id: sensorData.device_id,
                timestamp: sensorData.timestamp,
                alerts_triggered: alerts.length > 0,
                alert_level: alertLevel
            })
        };
        
    } catch (error) {
        console.error('❌ Error processing data:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                stack: error.stack
            })
        };
    }
};

// Check sensor readings against thresholds
function checkThresholds(data) {
    const alerts = [];
    
    // Check soil moisture
    if (data.soil_moisture < THRESHOLDS.soilMoisture.critical) {
        alerts.push({
            type: 'CRITICAL',
            parameter: 'Soil Moisture',
            value: data.soil_moisture,
            threshold: THRESHOLDS.soilMoisture.critical,
            message: `Soil moisture critically low (${data.soil_moisture.toFixed(1)}%). Plant needs immediate watering!`
        });
    } else if (data.soil_moisture < THRESHOLDS.soilMoisture.warning) {
        alerts.push({
            type: 'WARNING',
            parameter: 'Soil Moisture',
            value: data.soil_moisture,
            threshold: THRESHOLDS.soilMoisture.warning,
            message: `Soil moisture low (${data.soil_moisture.toFixed(1)}%). Consider watering soon.`
        });
    }
    
    // Check temperature
    if (data.temperature > THRESHOLDS.temperature.max) {
        alerts.push({
            type: 'WARNING',
            parameter: 'Temperature',
            value: data.temperature,
            threshold: THRESHOLDS.temperature.max,
            message: `Temperature too high (${data.temperature.toFixed(1)}°C). Plant may be stressed.`
        });
    } else if (data.temperature < THRESHOLDS.temperature.min) {
        alerts.push({
            type: 'WARNING',
            parameter: 'Temperature',
            value: data.temperature,
            threshold: THRESHOLDS.temperature.min,
            message: `Temperature too low (${data.temperature.toFixed(1)}°C). Plant may be cold.`
        });
    }
    
    // Check humidity
    if (data.humidity < THRESHOLDS.humidity.min) {
        alerts.push({
            type: 'INFO',
            parameter: 'Humidity',
            value: data.humidity,
            threshold: THRESHOLDS.humidity.min,
            message: `Humidity low (${data.humidity.toFixed(1)}%). Air is dry.`
        });
    } else if (data.humidity > THRESHOLDS.humidity.max) {
        alerts.push({
            type: 'INFO',
            parameter: 'Humidity',
            value: data.humidity,
            threshold: THRESHOLDS.humidity.max,
            message: `Humidity high (${data.humidity.toFixed(1)}%). Risk of fungal growth.`
        });
    }
    
    // Check light intensity
    if (data.light_intensity < THRESHOLDS.lightIntensity.min) {
        alerts.push({
            type: 'INFO',
            parameter: 'Light',
            value: data.light_intensity,
            threshold: THRESHOLDS.lightIntensity.min,
            message: `Light intensity low (${data.light_intensity.toFixed(0)} lux). Plant may need more light.`
        });
    } else if (data.light_intensity > THRESHOLDS.lightIntensity.max) {
        alerts.push({
            type: 'WARNING',
            parameter: 'Light',
            value: data.light_intensity,
            threshold: THRESHOLDS.lightIntensity.max,
            message: `Light intensity very high (${data.light_intensity.toFixed(0)} lux). Risk of leaf burn.`
        });
    }
    
    return alerts;
}

// Determine overall alert level
function determineAlertLevel(alerts) {
    if (alerts.length === 0) return 'NORMAL';
    
    const hasCritical = alerts.some(a => a.type === 'CRITICAL');
    const hasWarning = alerts.some(a => a.type === 'WARNING');
    
    if (hasCritical) return 'CRITICAL';
    if (hasWarning) return 'WARNING';
    return 'INFO';
}

// Save sensor data to DynamoDB
async function saveSensorData(data) {
    const params = {
        TableName: SENSOR_DATA_TABLE,
        Item: {
            device_id: data.device_id,
            timestamp: data.timestamp,
            soil_moisture: data.soil_moisture,
            temperature: data.temperature,
            humidity: data.humidity,
            light_intensity: data.light_intensity,
            ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days retention
        }
    };
    
    return dynamo.put(params).promise();
}

// Save alert to DynamoDB alert history
async function saveAlert(sensorData, alerts, alertLevel) {
    const params = {
        TableName: ALERT_HISTORY_TABLE,
        Item: {
            device_id: sensorData.device_id,
            alert_timestamp: sensorData.timestamp,
            alert_level: alertLevel,
            alerts: alerts,
            sensor_readings: {
                soil_moisture: sensorData.soil_moisture,
                temperature: sensorData.temperature,
                humidity: sensorData.humidity,
                light_intensity: sensorData.light_intensity
            },
            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days retention
        }
    };
    
    return dynamo.put(params).promise();
}

// Send SNS notification
async function sendSNSAlert(sensorData, alerts, alertLevel) {
    // Build email message
    let message = `🌱 SPCMS ${alertLevel} Alert\n\n`;
    message += `Device: ${sensorData.device_id}\n`;
    message += `Time: ${sensorData.timestamp}\n\n`;
    message += `Current Readings:\n`;
    message += `- Soil Moisture: ${sensorData.soil_moisture.toFixed(1)}%\n`;
    message += `- Temperature: ${sensorData.temperature.toFixed(1)}°C\n`;
    message += `- Humidity: ${sensorData.humidity.toFixed(1)}%\n`;
    message += `- Light: ${sensorData.light_intensity.toFixed(0)} lux\n\n`;
    message += `Alerts:\n`;
    alerts.forEach((alert, index) => {
        message += `${index + 1}. [${alert.type}] ${alert.message}\n`;
    });
    
    const params = {
        TopicArn: SNS_TOPIC_ARN,
        Subject: `🌱 SPCMS ${alertLevel} Alert - ${sensorData.device_id}`,
        Message: message
    };
    
    return sns.publish(params).promise();
}