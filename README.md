#  AI-Based Emergency Ambulance Route Planning System

An intelligent web-based emergency ambulance routing system designed to reduce ambulance response delays by combining **GPS/location support, emergency reporting, route optimization, simulated traffic conditions, and hospital resource-based selection**.

The system helps ambulance drivers and emergency dispatchers identify suitable hospitals and routes based on the emergency type, location, distance, traffic conditions, and simulated hospital availability.


##  Project Overview

During medical emergencies, ambulance delays can occur due to:

- Traffic congestion
- Poor route selection
- Lack of information about nearby hospitals
- Difficulty communicating emergency details
- Unavailability of suitable hospital resources

This project provides a centralized web-based solution where an ambulance driver can:

1. Report an emergency.
2. Select the emergency type and severity.
3. Use GPS/location information.
4. View suitable hospitals.
5. Calculate optimized routes.
6. Consider simulated traffic conditions.
7. Consider simulated hospital resources.
8. Receive route and hospital recommendations.
9. Use voice input for emergency reporting.

The system is designed as a **prototype/simulation for academic and research purposes**.



##  Objectives

- Reduce ambulance travel delays.
- Provide optimized emergency routes.
- Help drivers quickly report emergencies.
- Reduce dependency on typing during emergencies.
- Consider traffic conditions during route selection.
- Select hospitals based on emergency requirements.
- Provide a simple and driver-friendly interface.
- Demonstrate intelligent decision-making for emergency ambulance routing.



##  Key Features

### Emergency Reporting

Drivers can quickly report an emergency using predefined emergency types such as:

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

The system also supports severity levels:

- Critical
- High
- Moderate
- Low

This reduces the need for typing during emergency situations.



###  Voice Emergency Input

The system supports browser-based voice input using the **Web Speech API**.

Drivers can speak simple or imperfect English phrases, for example:

```text
"heart pain"
"accident happened"
"not breathing"
"he got stroke"
"snake bite"
"breathing problem"
