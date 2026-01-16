# EmailJS Configuration Guide
# Follow these steps to enable the automated contact form

## Step 1: Create EmailJS Account
1. Visit https://www.emailjs.com/
2. Create a free account
3. Verify your email

## Step 2: Add Gmail Service
1. Go to "Email Services" → "Add New Service"
2. Choose "Gmail"
3. Connect your Gmail account: airfrostunlimitedsoftwarenextg@gmail.com
4. Service ID will be generated (e.g., "service_xxxxx")

## Step 3: Create Email Template
1. Go to "Email Templates" → "Create New Template"
2. Use this template:

Subject: New Contact Form Message from {{from_name}}

Hello,

You have received a new message from your portfolio website:

Name: {{from_name}}
Email: {{from_email}}
Service: {{service_type}}
Message: {{message}}

Reply to: {{reply_to}}

Best regards,
Portfolio Contact Form

3. Template ID will be generated (e.g., "template_xxxxx")

## Step 4: Get Your Public Key
1. Go to "Account" → "General"
2. Copy your Public Key (e.g., "xxxxxxxxxxxxxxx")

## Step 5: Update index.html
Replace the following in index.html:

1. Line ~724: emailjs.init('YOUR_PUBLIC_KEY'); → emailjs.init('your_actual_public_key');
2. Line ~756: emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams)
   → emailjs.send('your_service_id', 'your_template_id', templateParams)

## Alternative: Direct Contact
If EmailJS is not set up, visitors can contact you directly at:
airfrostunlimitedsoftwarenextg@gmail.com