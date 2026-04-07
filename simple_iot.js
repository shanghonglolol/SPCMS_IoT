var awsIot = require('aws-iot-device-sdk');

var device = awsIot.device({
    keyPath: './certs/private.pem.key',
    certPath: './certs/certificate.pem.crt',
    caPath: './certs/amazon.pem',
    clientId: 'spcms-device-001',
    host: 'ab1j9yleosmq8-ats.iot.us-east-1.amazonaws.com'
});

device.on('connect', function() {
    console.log('✅ SPCMS Device Connected to AWS IoT');
    
    // Simulates critical soil moisture reading
    var sensorPayload = {
        device_id: 'device-001',
        timestamp: new Date().toISOString(),
        soil_moisture: 60,      // CRITICAL -> below 20% // 60 for perfect data, no alerts
        temperature: 32,        // WARNING -> above 30 degrees Celcius // 25 for perfect data, no alerts
        humidity: 39,           // 60 as ideal humidity
        light_intensity: 1000   // 1000 lux as ideal light
    };
    
    console.log('📊 Publishing sensor data:', sensorPayload);
    device.publish('plant-monitor/sensors/data', JSON.stringify(sensorPayload));
    
    console.log('✅ Data published! Check email and DynamoDB.');
    
    // Closes after 2 seconds
    setTimeout(function() {
        device.end();
        console.log('🔌 Disconnected');
        process.exit(0);
    }, 2000);
});

device.on('error', function(error) {
    console.error('❌ Connection error:', error);
});