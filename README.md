# Scantron — Mobile Computer Vision System for Automated MCQ Grading

Scantron is a mobile application for **automated multiple-choice examination grading** using smartphone cameras and computer vision. The system captures an image of a student's bubble answer sheet, processes the image to identify marked responses and student information, compares the detected answers against an answer key, and generates a structured grading result.

The project was developed as a third-year Computer Science project to investigate how **computer vision and image-processing techniques can be applied to automate Optical Mark Recognition (OMR)-style examination workflows using commodity mobile hardware**.

---

## Demo





https://github.com/user-attachments/assets/8ef3b510-b5ad-4006-b09d-d317b916a328








## Overview

Traditional paper-based examination grading can require significant manual effort, particularly when large numbers of multiple-choice answer sheets must be processed. Dedicated OMR scanners can automate this process, but they introduce additional hardware and deployment costs.

Scantron explores an alternative approach: using a smartphone as the image-acquisition device and computer-vision algorithms to process the captured answer sheet.

The system follows a pipeline in which:


<img width="8286" height="8857" alt="overall-achitecture" src="https://github.com/user-attachments/assets/eebb4747-7bb6-4b02-9da5-acee760c0e19" />


---

# Key Features

* 📷 Capture examination answer sheets using a smartphone camera
* 👁️ Detect marked multiple-choice bubbles using computer vision
* 🆔 Extract and interpret student index numbers
* 📘 Associate a scanned sheet with a course/answer key
* ✅ Compare detected answers against the correct answer key
* 📊 Calculate scores and percentages automatically
* 🖼️ Generate annotated images for visual verification
* 🔄 Process examination sheets through a frontend-to-backend pipeline
* 📄 Generate structured JSON grading results
* 📑 Export student results to Excel
* 📱 Designed around accessible smartphone hardware rather than dedicated OMR scanners

---

# System Architecture

Scantron consists of a mobile frontend and an image-processing backend.

```text
┌──────────────────────────────┐
│        Mobile Frontend      │
│                              │
│  React Native + Expo         │
│                              │
│  • Camera/Image Capture      │
│  • Answer Key Input          │
│  • Result Display            │
│  • Excel Export              │
└──────────────┬───────────────┘
               │
               │ HTTP POST
               ▼
┌──────────────────────────────┐
│       Image Processing       │
│           Backend            │
│                              │
│  • Image preprocessing       │
│  • Thresholding              │
│  • Contour detection         │
│  • Region extraction         │
│  • Bubble detection          │
│  • Index-number detection    │
│  • Answer interpretation     │
│  • Score calculation         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│          Results             │
│                              │
│  • Student ID                │
│  • Selected answers          │
│  • Score                     │
│  • Percentage                │
│  • Annotated images          │
│  • JSON response             │
│  • Excel report              │
└──────────────────────────────┘
```

---

# Image Processing Pipeline

The central component of Scantron is its computer-vision pipeline.

The pipeline transforms a photograph of an answer sheet into structured examination data.

## 1. Image Acquisition

The student answer sheet is captured using the mobile application's camera.

The captured image is then passed into the processing pipeline.

```text
Captured Image
      │
      ▼
Image Extraction
      │
      ▼
Processing Pipeline
```

The approach is designed around smartphone-based image acquisition rather than requiring a dedicated OMR scanner.

---

## 2. Image Preprocessing

The captured image is prepared for subsequent computer-vision operations.

Preprocessing is important because the raw camera image can contain visual information that makes direct bubble detection unreliable.

The processing pipeline therefore transforms the captured image into representations that make the answer regions easier to identify.

---

## 3. Thresholding

Thresholding is applied to transform the image into a representation in which marked regions and sheet structures can be more clearly distinguished.

```text
Original Image
      │
      ▼
Preprocessing
      │
      ▼
Threshold Image
```

The thresholded representation is subsequently used for contour-based region detection.

---

## 4. Contour Detection

Contours are extracted from the thresholded image to identify relevant geometric regions on the answer sheet.

The detected contours provide the basis for locating:

* Answer regions
* Bubble regions
* Student index-number regions
* Other relevant sheet structures

```text
Thresholded Sheet
        │
        ▼
Contour Detection
        │
        ▼
Candidate Regions
```

---

## 5. Answer Detection

The answer regions are isolated and analyzed to determine which bubbles have been marked.

The detected selections are converted into structured answer values that can subsequently be compared with the answer key.

```text
Answer Region
      │
      ▼
Bubble Analysis
      │
      ▼
Detected Answer
```

---

## 6. Student Index Number Detection

The same image-processing approach is applied to the index-number section of the sheet.

The system analyzes the relevant regions and reconstructs the student's index number from the detected marks.

Example:

```text
Detected Index Number
        ↓
3392022
```

---

## 7. Answer-Key Comparison

Once the student's selected answers have been detected, they are compared against the supplied answer key.

```text
Student Answers
       │
       ├──────────────┐
       │              │
       ▼              ▼
Detected Answers   Answer Key
       │              │
       └──────┬───────┘
              ▼
        Answer Comparison
              │
              ▼
         Score Calculation
```

---

# Backend Processing Pipeline

The backend receives the captured sheet from the mobile application and performs the image-processing and grading operations.

```text
Captured Sheet
      │
      ▼
Image Processing
      │
      ├── Index Number Detection
      │
      ├── Answer Region Detection
      │
      ├── Bubble Detection
      │
      └── Answer Interpretation
      │
      ▼
Answer-Key Comparison
      │
      ▼
Score Calculation
      │
      ▼
JSON Response
      │
      ▼
Mobile Application
```

---

# Frontend Pipeline

The mobile application is responsible for image acquisition, interaction with the grading workflow, and presentation/export of results.

```text
Capture Answer Sheet
        │
        ▼
Extract Image
        │
        ▼
Provide Answer Key
        │
        ▼
Send Image + Answer Key
        │
        ▼
Receive Grading Result
        │
        ▼
Display Results
        │
        ├── Student ID
        ├── Score
        ├── Percentage
        ├── Selected Answers
        └── Annotated Images
```

---

# Result Generation

A successful scan produces structured grading information.

A simplified response has the following structure:

```json
{
  "score": 40,
  "ID": 12345,
  "total_questions": 50,
  "chances": ["0", "1", "3", "2", "1"],
  "annotated_images": [
    {
      "id": "data:image/png;base64,...",
      "name": "image.png"
    }
  ]
}
```

The result contains:

* Student identification number
* Score
* Total number of questions
* Detected answer selections
* Annotated images generated during processing

The structured response allows the frontend to display the result and provides a basis for subsequent report generation.

---

# Excel Reporting

Scantron also supports exporting grading results into Excel format.

This allows processed results to be retained for later analysis and provides a more convenient format for instructors or administrators handling multiple students.

The intended workflow is:

```text
Scan Sheet
    ↓
Grade Sheet
    ↓
Generate Result
    ↓
Export Excel Report
```

---

# Technology Stack

## Mobile Application

* **React Native**
* **Expo**

## Computer Vision

* **OpenCV.js**
* Image preprocessing
* Thresholding
* Contour detection
* Region extraction
* Bubble/mark detection

## Image Processing Integration

* **WebView**

The WebView-based architecture allows the application to execute the OpenCV.js image-processing workflow within the mobile application environment.

## Data & Reporting

* **XLSX** for Excel report generation
* **JSON** for structured grading responses

---

# Example Processing Result

For a successfully processed answer sheet, Scantron can produce information such as:

```text
Student ID:       3392022
Score:            9/10
Percentage:       90%
Processing Mode:  Automated
```

Annotated images can also be returned to provide a visual representation of the detected regions and answers.

---

# Project Objectives

The project was developed around the following objectives:

### 1. Automate MCQ Grading

Reduce the amount of manual work required to grade multiple-choice answer sheets.

### 2. Explore Computer Vision for OMR

Investigate how image-processing techniques can be used to recognize marked bubbles from photographs of paper answer sheets.

### 3. Use Accessible Hardware

Explore whether smartphone cameras can serve as a low-cost alternative to dedicated OMR scanning hardware for suitable examination workflows.

### 4. Provide Rapid Results

Generate grading results shortly after an answer sheet is captured and processed.

### 5. Provide Digital Reporting

Convert grading results into structured data and downloadable Excel reports.

### 6. Support Visual Verification

Generate annotated images that can help users inspect the computer-vision output.

---

# Experimental Results

During development and testing, the system successfully demonstrated the end-to-end workflow:

```text
Capture
  ↓
Process
  ↓
Detect
  ↓
Grade
  ↓
Return Result
  ↓
Export
```

In a demonstrated test case, the system identified student index number **3392022** and produced a score of **9/10 (90%)**.

Processing was observed to occur in approximately **two seconds per examination sheet** in the development/testing environment.

> **Note:** Processing time and accuracy are dependent on image quality, answer-sheet layout, lighting conditions, camera characteristics, and the detection parameters used by the computer-vision pipeline. A larger controlled evaluation dataset would be required to report statistically rigorous accuracy and latency measurements.

---

# Limitations

The prototype has several limitations that provide opportunities for further research and development.

### Image Quality

Poor lighting, blur, shadows, perspective distortion, and low-resolution images can affect detection performance.

### Fixed Sheet Layout

The current implementation is designed around a particular answer-sheet structure. Supporting arbitrary OMR layouts would require a more generalized detection approach.

### Marking Variations

Different marking styles, partially filled bubbles, erased answers, and multiple markings may introduce ambiguity.

### Dataset Size

The prototype was evaluated during development rather than through a large-scale controlled benchmark dataset.

### Hardware Variation

Camera characteristics differ between smartphones and may influence image-processing performance.

---


# Digital Poster


<img width="2550" height="3300" alt="Emmanuel Fynn-Sackey(3392022)-2_page-0001" src="https://github.com/user-attachments/assets/c30fa6ab-ff3a-4344-8d5c-0f941ae29642" />






# Future Research and Development

Several extensions could improve the robustness and research value of the system.

## Robust Document Detection

Develop more robust document-boundary and perspective-correction methods to handle photographs captured from different angles.

## Adaptive Image Preprocessing

Investigate adaptive thresholding and preprocessing methods that perform more consistently under different lighting conditions.

## Generalized OMR Recognition

Develop a configurable recognition pipeline capable of supporting multiple answer-sheet layouts.

## Confidence-Based Detection

Associate confidence scores with detected answers and identify ambiguous responses for human review.

## Instructor Review Interface

Provide an interface allowing instructors to verify or correct uncertain computer-vision predictions.

## Batch Processing

Extend the system to process large numbers of answer sheets automatically.

## Learning-Based Detection

Investigate machine-learning or deep-learning approaches for bubble and document detection and compare them with the classical computer-vision pipeline.

## Educational Platform Integration

Integrate Scantron with Learning Management Systems (LMS) and other educational platforms to automate the complete assessment workflow.

## Large-Scale Evaluation

Conduct controlled experiments across different:

* Smartphones
* Lighting conditions
* Camera distances
* Sheet orientations
* Marking styles
* Answer-sheet layouts

and report quantitative metrics such as detection accuracy, precision, recall, processing latency, and failure rates.

---

# Running the Project

## Prerequisites

Install:

* Node.js
* npm
* Expo CLI / Expo development environment
* A compatible Android/iOS development environment or Expo Go where supported

Clone the repository:

```bash
git clone <repository-url>
cd Scantron
```

Install dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npx expo start
```

Follow the Expo output to launch the application on a connected device or emulator.

> **Note:** The exact setup may vary depending on the project's current dependency versions and backend configuration.

---

# Research Context

Scantron was developed as a third-year Computer Science project exploring the application of **computer vision to educational assessment automation**.

The project provides a practical platform for investigating questions around:

* Mobile-based Optical Mark Recognition
* Computer-vision robustness
* Automated assessment
* Image preprocessing
* Classical computer-vision techniques
* Human-in-the-loop verification
* Low-cost educational technology

---

# References

1. Kulkarni, S. et al. (2024). *A Survey on OMR Automated Grading System*. International Journal for Research Trends and Innovation.

2. Shivapur, S. et al. (2022). *OMR Sheet Scanner using Image Processing in Android*. Zenodo.

3. Siregar, M. et al. (2023). *Efficient Camera-Based MCQ Grading System*. IJISAE (Indonesian Journal of Innovative Science and Applied Engineering).

---

# Conclusion

Scantron demonstrates how a smartphone-based computer-vision workflow can be used to automate multiple-choice examination grading without requiring dedicated OMR scanning hardware.

The prototype combines mobile application development, image processing, contour analysis, mark detection, answer-key comparison, structured result generation, and spreadsheet reporting into a single workflow.

The project establishes a foundation for further investigation into **robust mobile OMR, intelligent document analysis, machine-learning-assisted answer recognition, and automated educational assessment systems**.
