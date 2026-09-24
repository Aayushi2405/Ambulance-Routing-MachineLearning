# AI-Based Emergency Ambulance Route Planning System

An intelligent ambulance routing and emergency management system designed to reduce ambulance delays by combining emergency reporting, GPS-based location, route optimization, traffic simulation, and hospital resource evaluation.

## Project Overview

Emergency response time is critical in medical emergencies. Ambulances may face delays because of traffic, inefficient route selection, or lack of information about suitable hospitals.

This project provides a software-based ambulance routing system that helps identify a suitable hospital and calculate an efficient route based on:

- Ambulance location
- Emergency type
- Emergency severity
- Distance
- Estimated travel time
- Simulated traffic conditions
- Hospital availability
- ICU and bed availability
- Required medical specialization

The system is developed as an academic project and uses simulated traffic and hospital resource data for demonstration purposes.

## Key Features

### 1. Emergency Reporting

Drivers can report an emergency through the application by selecting:

- Emergency type
- Emergency severity
- Patient-related information
- Emergency location

Supported emergency types include:

- Accident
- Heart Attack
- Stroke
- Breathing Difficulty
- Heat Stroke
- Unconscious Person
- Snake Bite
- Poisoning
- Severe Burns
- Other

Severity levels include:

- Critical
- High
- Moderate
- Low

### 2. Voice Input

The emergency reporting form supports browser-based voice input using the Web Speech API.

The system can understand common phrases and map them to the available emergency categories.

Examples:

```text
"heart pain"       -> Heart Attack
"not breathing"    -> Breathing Difficulty
"accident happened" -> Accident
"he got stroke"    -> Stroke
"person unconscious" -> Unconscious Person
"heat problem"     -> Heat Stroke
"snake bite"       -> Snake Bite
"poison"           -> Poisoning
"burn"             -> Severe Burns
