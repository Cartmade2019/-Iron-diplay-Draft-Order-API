const express = require('express');
const axios = require('axios');
const app = express();
require('dotenv').config(); // Load environment variables from .env

// Configuration
const token = process.env.SHOPIFY_ACCESS_TOKEN;
const url = process.env.SHOPIFY_URL;
const accessTokenHeader = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
};

app.use(express.json());

// Allow CORS and handle OPTIONS requests
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Function to get variant data
async function getVariantData(variantId) {
    const metaUrl = `${url}/admin/variants/${variantId}.json`;
    
    try {
        const response = await axios.get(metaUrl, { headers: accessTokenHeader });
        const variantData = response.data;

        if (!variantData || !variantData.variant) {
            return null;
        }
        
        return variantData.variant;
    } catch (error) {
        console.error('Error fetching variant data:', error);
        return null;
    }
}

// Function to create a draft order
async function createDraftOrder(data) {
    const lineItems = [];

    if (data.line_items && Array.isArray(data.line_items)) {
        for (let lineItem of data.line_items) {
            if (!lineItem) continue;
            
            const variant = await getVariantData(lineItem.id);
            if (!variant) continue;
            
            lineItems.push({
                variant_id: lineItem.id,
                product_id: variant.product_id,
                quantity: parseInt(lineItem.quantity, 10),
            });
        }
    }

    const noteAttributes = Object.keys(data.Form_details || {}).map(key => ({
        name: key,
        value: data.Form_details[key]
    }));

    const shippingLine = data.Shipping_details || {};
    const shippingAdress={
        name: data.Form_details?.name || '',
        phone: data.Form_details?.phone || '',
    };

    const draftOrderData = {
        draft_order: {
            line_items: lineItems,
            shipping_line: {
                custom: true,
                title: shippingLine.type,
                price: shippingLine.price,
            },
            note_attributes: noteAttributes,
            billing_address: {
                email: data.Form_details?.email || '', // Add email from form details
                name: data.Form_details?.name || '',   // Add name from form details
                phone: data.Form_details?.phone || ''  // Add phone from form details
            },
            email: data.Form_details?.email || '', // Add email from form details
        }
    };

    try {
        const response = await axios.post(
            `${url}/admin/api/2024-10/draft_orders.json`,
            draftOrderData,
            { headers: accessTokenHeader }
        );

        return response.data;
    } catch (error) {
        console.error('Error creating draft order:', error);
        return null;
    }
}

// POST route for handling the request
app.post('/create-draft-order', async (req, res) => {
    const data = req.body;

    if (!data) {
        return res.status(400).json({ success: false, message: 'Error: No data received' });
    }

    const createdOrderResponseData = await createDraftOrder(data);

    if (!createdOrderResponseData) {
        return res.status(500).json({ success: false, message: 'Error creating draft order' });
    }

    if (createdOrderResponseData.draft_order && createdOrderResponseData.draft_order.invoice_url) {
        return res.json({
            success: true,
            message: 'Draft Order created successfully',
            invoice_url: createdOrderResponseData.draft_order.invoice_url
        });
    } else {
        return res.status(500).json({ success: false, message: 'Error creating draft order' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

