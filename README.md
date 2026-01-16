# Onuoha Ikechukwu David - Portfolio

[![Website](https://img.shields.io/badge/🌐-Live%20Website-blue)](https://dave870-coder.github.io/David/)

## About

This is the personal portfolio website of **Onuoha Ikechukwu David**, a Software Developer & Graphic Designer specializing in:
- Web Applications & Automation
- UI/UX Design
- Professional Graphics
- Software Development

## Live Website

Visit the live portfolio at: **https://dave870-coder.github.io/David/**

## Setup Instructions

### EmailJS Configuration (Required for Contact Form)

1. **Create an EmailJS Account**: Visit [https://www.emailjs.com/](https://www.emailjs.com/) and create a free account
2. **Add Email Service**: 
   - Go to Email Services → Add New Service
   - Choose Gmail and connect your account (airfrostunlimitedsoftwarenextg@gmail.com)
3. **Create Email Template**:
   - Go to Email Templates → Create New Template
   - Use this template structure:
     ```
     Subject: New Contact Form Message from {{from_name}}

     Hello,

     You have received a new message from your portfolio website:

     Name: {{from_name}}
     Email: {{from_email}}
     Service: {{service_type}}
     Message: {{message}}

     Reply to: {{reply_to}}
     ```
4. **Get Your Keys**:
   - Copy your Service ID, Template ID, and Public Key
5. **Update the Code**:
   - Open `index.html`
   - Find the line: `emailjs.init('YOUR_PUBLIC_KEY');`
   - Replace `'YOUR_PUBLIC_KEY'` with your actual Public Key
   - Find: `emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)`
   - Replace `'YOUR_SERVICE_ID'` and `'YOUR_TEMPLATE_ID'` with your actual IDs

### Alternative Contact Method

If EmailJS setup is not completed, visitors can still contact you directly at: **airfrostunlimitedsoftwarenextg@gmail.com**

## Features

- **Universal Responsive Design**: Adapts seamlessly to all display types from palm tops (320px) to 4K ultra-wide monitors (3840px+)
- **Fluid Typography**: Text scales smoothly across all screen sizes using clamp() functions
- **Mobile-First Navigation**: Hamburger menu with improved breakpoints and click-outside-to-close functionality
- **Adaptive Grid Systems**: Content layouts that automatically adjust from 1 to 3 columns based on screen size
- **Automated Contact Form**: Integrated EmailJS for sending messages directly to airfrostunlimitedsoftwarenextg@gmail.com
- **Interactive Portfolio**: Showcase with admin panel for project management
- **Success Feedback**: Visual confirmation messages for user actions
- **Comprehensive Error Handling**: Robust error catching and user-friendly error messages
- **Enhanced Security**: Advanced anti-inspect functionality preventing browser dev tools access
- **Dynamic Image Galleries**: Daily-rotating preview images
- **Smooth Animations**: Scroll-triggered animations and transitions

## Contact

- **Email**: airfrostunlimitedsoftwarenextg@gmail.com
- **Phone**: +234 903 599 7559
- **Location**: Babcock University, Ilishan Remo, Ogun State, Nigeria

---

© 2026 AirFrostUnlimitedInnovations. All rights reserved.