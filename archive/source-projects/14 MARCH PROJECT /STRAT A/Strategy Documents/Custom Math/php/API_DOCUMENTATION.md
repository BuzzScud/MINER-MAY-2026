# CLLM REST API Documentation

Complete HTTP REST API for the Crystalline Lattice Language Model.

## Base URL

```
http://localhost:8080/api
```

## Authentication

Currently no authentication required. In production, implement JWT or API keys.

## Response Format

All responses are JSON:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses:
```json
{
  "error": "Error message"
}
```

## Endpoints

### Health & Info

#### GET /health

Check API health status.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "extension_loaded": true,
  "timestamp": 1702483200
}
```

**Example:**
```bash
curl http://localhost:8080/api/health
```

#### GET /version

Get API and CLLM version information.

**Response:**
```json
{
  "success": true,
  "version": "1.0.0",
  "php_version": "8.2.0",
  "api_version": "1.0.0"
}
```

**Example:**
```bash
curl http://localhost:8080/api/version
```

#### GET /endpoints

List all available endpoints.

**Example:**
```bash
curl http://localhost:8080/api/endpoints
```

---

### Model Management

#### POST /model/create

Create a new CLLM model.

**Request Body:**
```json
{
  "platonic_solid": 1,
  "vocab_size": 1000,
  "options": {
    "embedding_dim": 64,
    "hidden_dim": 128,
    "num_layers": 2,
    "num_heads": 8,
    "max_seq_len": 128,
    "learning_rate": 0.001
  }
}
```

**Response:**
```json
{
  "success": true,
  "model_id": "model_abc123",
  "info": {
    "vocab_size": 1000,
    "embedding_dim": 64,
    "hidden_dim": 128,
    "num_layers": 2,
    "num_heads": 8,
    "max_seq_len": 128,
    "platonic_solid": 1,
    "learning_rate": 0.001
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/model/create \
  -H "Content-Type: application/json" \
  -d '{
    "platonic_solid": 1,
    "vocab_size": 1000,
    "options": {
      "embedding_dim": 64,
      "num_layers": 2
    }
  }'
```

#### GET /model/info

Get model information.

**Query Parameters:**
- `model_id`: Model identifier

**Response:**
```json
{
  "success": true,
  "info": {
    "vocab_size": 1000,
    "embedding_dim": 64,
    "num_layers": 2
  }
}
```

**Example:**
```bash
curl "http://localhost:8080/api/model/info?model_id=model_abc123"
```

#### POST /model/save

Save model to file.

**Request Body:**
```json
{
  "model_id": "model_abc123",
  "filename": "/tmp/my_model.cllm"
}
```

**Response:**
```json
{
  "success": true,
  "filename": "/tmp/my_model.cllm",
  "size": 87654
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/model/save \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "model_abc123",
    "filename": "/tmp/my_model.cllm"
  }'
```

#### POST /model/load

Load model from file.

**Request Body:**
```json
{
  "filename": "/tmp/my_model.cllm"
}
```

**Response:**
```json
{
  "success": true,
  "model_id": "model_def456",
  "info": { ... }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/model/load \
  -H "Content-Type: application/json" \
  -d '{"filename": "/tmp/my_model.cllm"}'
```

---

### Vocabulary Management

#### POST /vocab/create

Create a new vocabulary.

**Request Body:**
```json
{
  "capacity": 10000
}
```

**Response:**
```json
{
  "success": true,
  "vocab_id": "vocab_xyz789",
  "stats": {
    "size": 4,
    "capacity": 10000,
    "total_tokens": 0,
    "pad_token_id": 0,
    "unk_token_id": 1,
    "bos_token_id": 2,
    "eos_token_id": 3
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/vocab/create \
  -H "Content-Type: application/json" \
  -d '{"capacity": 10000}'
```

#### POST /vocab/build

Build vocabulary from text or file.

**Request Body (from text):**
```json
{
  "vocab_id": "vocab_xyz789",
  "text": "The sky is blue. Prime numbers are important."
}
```

**Request Body (from file):**
```json
{
  "vocab_id": "vocab_xyz789",
  "filename": "/path/to/training.txt"
}
```

**Response:**
```json
{
  "success": true,
  "tokens_added": 156,
  "stats": {
    "size": 160,
    "capacity": 10000,
    "total_tokens": 234
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/vocab/build \
  -H "Content-Type: application/json" \
  -d '{
    "vocab_id": "vocab_xyz789",
    "text": "The sky is blue. Prime numbers are important."
  }'
```

#### POST /vocab/tokenize

Tokenize text into token IDs.

**Request Body:**
```json
{
  "vocab_id": "vocab_xyz789",
  "text": "The sky is blue"
}
```

**Response:**
```json
{
  "success": true,
  "text": "The sky is blue",
  "tokens": [4, 5, 6, 7],
  "num_tokens": 4
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/vocab/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "vocab_id": "vocab_xyz789",
    "text": "The sky is blue"
  }'
```

#### POST /vocab/detokenize

Convert token IDs back to text.

**Request Body:**
```json
{
  "vocab_id": "vocab_xyz789",
  "tokens": [4, 5, 6, 7]
}
```

**Response:**
```json
{
  "success": true,
  "tokens": [4, 5, 6, 7],
  "text": "the sky is blue"
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/vocab/detokenize \
  -H "Content-Type: application/json" \
  -d '{
    "vocab_id": "vocab_xyz789",
    "tokens": [4, 5, 6, 7]
  }'
```

#### POST /vocab/save

Save vocabulary to file.

**Request Body:**
```json
{
  "vocab_id": "vocab_xyz789",
  "filename": "/tmp/my_vocab.vocab"
}
```

**Response:**
```json
{
  "success": true,
  "filename": "/tmp/my_vocab.vocab",
  "size": 12345
}
```

#### POST /vocab/load

Load vocabulary from file.

**Request Body:**
```json
{
  "filename": "/tmp/my_vocab.vocab"
}
```

**Response:**
```json
{
  "success": true,
  "vocab_id": "vocab_new123",
  "stats": { ... }
}
```

---

### Training

#### POST /training/init

Initialize training for a model.

**Request Body:**
```json
{
  "model_id": "model_abc123",
  "config": {
    "learning_rate": 0.001,
    "batch_size": 4,
    "num_epochs": 10,
    "sequence_length": 64
  }
}
```

**Response:**
```json
{
  "success": true,
  "training_id": "training_qwe456",
  "config": { ... }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/training/init \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "model_abc123",
    "config": {
      "learning_rate": 0.001,
      "batch_size": 4,
      "num_epochs": 10
    }
  }'
```

---

### Text Generation

#### POST /generate

Generate text from a prompt.

**Request Body:**
```json
{
  "model_id": "model_abc123",
  "prompt": "The sky is",
  "options": {
    "max_tokens": 20,
    "temperature": 0.8
  }
}
```

**Response:**
```json
{
  "success": true,
  "prompt": "The sky is",
  "generated": "The sky is blue because of light scattering...",
  "options": {
    "max_tokens": 20,
    "temperature": 0.8
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "model_abc123",
    "prompt": "The sky is",
    "options": {
      "max_tokens": 20,
      "temperature": 0.8
    }
  }'
```

---

### Math Functions

#### GET /math/prime/:n

Get the nth prime number.

**Response:**
```json
{
  "success": true,
  "n": 100,
  "prime": 541,
  "is_prime": true
}
```

**Example:**
```bash
curl http://localhost:8080/api/math/prime/100
```

#### GET /math/isprime/:num

Check if a number is prime.

**Response:**
```json
{
  "success": true,
  "number": 17,
  "is_prime": true
}
```

**Example:**
```bash
curl http://localhost:8080/api/math/isprime/17
```

#### POST /math/exp

Calculate e^x.

**Request Body:**
```json
{
  "x": 2.0
}
```

**Response:**
```json
{
  "success": true,
  "x": 2.0,
  "result": 7.389056
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/math/exp \
  -H "Content-Type: application/json" \
  -d '{"x": 2.0}'
```

#### POST /math/log

Calculate natural logarithm.

**Request Body:**
```json
{
  "x": 7.389056
}
```

**Response:**
```json
{
  "success": true,
  "x": 7.389056,
  "result": 2.0
}
```

**Example:**
```bash
curl -X POST http://localhost:8080/api/math/log \
  -H "Content-Type: application/json" \
  -d '{"x": 7.389056}'
```

#### POST /math/sin

Calculate sine.

**Request Body:**
```json
{
  "x": 1.5707963268
}
```

**Response:**
```json
{
  "success": true,
  "x": 1.5707963268,
  "result": 1.0
}
```

#### POST /math/cos

Calculate cosine.

**Request Body:**
```json
{
  "x": 0
}
```

**Response:**
```json
{
  "success": true,
  "x": 0,
  "result": 1.0
}
```

---

## Complete Workflow Example

### 1. Create Model
```bash
MODEL_RESPONSE=$(curl -s -X POST http://localhost:8080/api/model/create \
  -H "Content-Type: application/json" \
  -d '{
    "platonic_solid": 1,
    "vocab_size": 1000,
    "options": {"embedding_dim": 64, "num_layers": 2}
  }')

MODEL_ID=$(echo $MODEL_RESPONSE | jq -r '.model_id')
echo "Created model: $MODEL_ID"
```

### 2. Create and Build Vocabulary
```bash
VOCAB_RESPONSE=$(curl -s -X POST http://localhost:8080/api/vocab/create \
  -H "Content-Type: application/json" \
  -d '{"capacity": 5000}')

VOCAB_ID=$(echo $VOCAB_RESPONSE | jq -r '.vocab_id')
echo "Created vocabulary: $VOCAB_ID"

curl -X POST http://localhost:8080/api/vocab/build \
  -H "Content-Type: application/json" \
  -d "{
    &quot;vocab_id&quot;: &quot;$VOCAB_ID&quot;,
    &quot;text&quot;: &quot;The sky is blue. Prime numbers are important. Language models learn patterns.&quot;
  }"
```

### 3. Tokenize Text
```bash
curl -X POST http://localhost:8080/api/vocab/tokenize \
  -H "Content-Type: application/json" \
  -d "{
    &quot;vocab_id&quot;: &quot;$VOCAB_ID&quot;,
    &quot;text&quot;: &quot;The sky is blue&quot;
  }"
```

### 4. Initialize Training
```bash
curl -X POST http://localhost:8080/api/training/init \
  -H "Content-Type: application/json" \
  -d "{
    &quot;model_id&quot;: &quot;$MODEL_ID&quot;,
    &quot;config&quot;: {
      &quot;learning_rate&quot;: 0.001,
      &quot;batch_size&quot;: 4,
      &quot;num_epochs&quot;: 10
    }
  }"
```

### 5. Generate Text
```bash
curl -X POST http://localhost:8080/api/generate \
  -H "Content-Type: application/json" \
  -d "{
    &quot;model_id&quot;: &quot;$MODEL_ID&quot;,
    &quot;prompt&quot;: &quot;The sky is&quot;,
    &quot;options&quot;: {
      &quot;max_tokens&quot;: 20,
      &quot;temperature&quot;: 0.8
    }
  }"
```

### 6. Save Model
```bash
curl -X POST http://localhost:8080/api/model/save \
  -H "Content-Type: application/json" \
  -d "{
    &quot;model_id&quot;: &quot;$MODEL_ID&quot;,
    &quot;filename&quot;: &quot;/tmp/my_model.cllm&quot;
  }"
```

---

## Error Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

## Rate Limiting

Currently no rate limiting. In production, implement rate limiting per IP or API key.

## CORS

CORS is enabled for all origins. In production, restrict to specific domains.

## Session Management

Resources (models, vocabularies) are stored in PHP sessions. Sessions expire after 24 minutes of inactivity.

To persist resources across sessions, save to files and load when needed.

## Performance

- **Model Creation**: ~500ms
- **Vocabulary Building**: ~10,000 tokens/second
- **Tokenization**: ~100,000 tokens/second
- **Text Generation**: ~1,000 tokens/second

## Testing

### Start Server
```bash
cd php
make test-api
```

### Run Test Suite
```bash
php test_api.php
```

### Manual Testing with curl

See examples above for each endpoint.

## Production Deployment

### Using PHP-FPM + Nginx

**Nginx configuration:**
```nginx
server {
    listen 80;
    server_name api.example.com;
    
    root /var/www/cllm/php;
    index rest_api.php;
    
    location /api {
        try_files $uri $uri/ /rest_api.php?$query_string;
    }
    
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_index rest_api.php;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```

### Using Apache

**Apache configuration:**
```apache
<VirtualHost *:80>
    ServerName api.example.com
    DocumentRoot /var/www/cllm/php
    
    <Directory /var/www/cllm/php>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    
    RewriteEngine On
    RewriteRule ^api/(.*)$ rest_api.php [L,QSA]
</VirtualHost>
```

### Environment Variables

Set in your web server configuration:
```bash
LD_LIBRARY_PATH=/path/to/cllm:/path/to/cllm/math/lib
```

## Security Considerations

1. **Input Validation**: All inputs are validated
2. **File Access**: Restrict file operations to specific directories
3. **Resource Limits**: Implement memory and CPU limits
4. **Authentication**: Add JWT or API key authentication
5. **Rate Limiting**: Implement per-IP rate limiting
6. **HTTPS**: Use HTTPS in production
7. **CORS**: Restrict to specific origins

## Monitoring

### Logging

Enable PHP error logging:
```php
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', '/var/log/php/cllm_api.log');
```

### Metrics

Track:
- Request count per endpoint
- Response times
- Error rates
- Resource usage (models, vocabularies in memory)

## Support

For issues and questions, see the main CLLM repository.