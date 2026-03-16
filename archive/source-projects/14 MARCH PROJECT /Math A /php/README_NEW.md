# CLLM PHP Extension

Complete PHP bindings for the Crystalline Lattice Language Model (CLLM).

## Features

- **Model Management**: Create, save, load, and manage CLLM models
- **Vocabulary System**: Build vocabularies, tokenize/detokenize text
- **Training**: Initialize and configure training
- **Inference**: Generate text from prompts
- **Math Library**: Access to prime numbers and transcendental functions
- **REST API**: Full HTTP REST API server included

## Installation

### Prerequisites

- PHP 8.0+ with development headers
- CLLM libraries built and installed
- GCC compiler

### Build Steps

```bash
cd php
phpize
./configure --enable-cllm
make
sudo make install
```

### Enable Extension

Add to your `php.ini`:
```ini
extension=cllm.so
```

Or load dynamically in your script:
```php
<?php
dl('cllm.so');
?>
```

### Verify Installation

```bash
php -m | grep cllm
```

## API Reference

### Model Functions

#### `cllm_create_model(int $platonic_solid, int $vocab_size, array $options = []): resource`

Create a new CLLM model.

**Parameters:**
- `$platonic_solid`: Geometric type (CLLM_PLATONIC_CUBE, etc.)
- `$vocab_size`: Vocabulary size
- `$options`: Optional configuration array
  - `embedding_dim`: Embedding dimension (default: 256)
  - `hidden_dim`: Hidden dimension (default: 512)
  - `num_layers`: Number of layers (default: 6)
  - `num_heads`: Attention heads (default: 8)
  - `max_seq_len`: Maximum sequence length (default: 512)
  - `learning_rate`: Learning rate (default: 0.001)

**Returns:** Model resource or false on failure

**Example:**
```php
$model = cllm_create_model(CLLM_PLATONIC_CUBE, 1000, [
    'embedding_dim' => 64,
    'num_layers' => 2
]);
```

#### `cllm_model_info(resource $model): array`

Get model information.

**Returns:** Array with model configuration

**Example:**
```php
$info = cllm_model_info($model);
echo "Vocab size: {$info['vocab_size']}\n";
```

#### `cllm_save_model(resource $model, string $filename): bool`

Save model to file.

**Example:**
```php
cllm_save_model($model, 'my_model.cllm');
```

#### `cllm_load_model(string $filename): resource`

Load model from file.

**Example:**
```php
$model = cllm_load_model('my_model.cllm');
```

#### `cllm_free_model(resource $model): bool`

Free model resources (usually automatic).

### Vocabulary Functions

#### `cllm_vocab_create(int $capacity): resource`

Create a new vocabulary with special tokens.

**Example:**
```php
$vocab = cllm_vocab_create(10000);
```

#### `cllm_vocab_build_from_file(resource $vocab, string $filename): int`

Build vocabulary from a text file.

**Returns:** Number of tokens added

**Example:**
```php
$tokens_added = cllm_vocab_build_from_file($vocab, 'training.txt');
```

#### `cllm_vocab_tokenize(resource $vocab, string $text): array`

Convert text to token IDs.

**Example:**
```php
$tokens = cllm_vocab_tokenize($vocab, "The sky is blue");
// Returns: [4, 5, 6, 7]
```

#### `cllm_vocab_detokenize(resource $vocab, array $token_ids): string`

Convert token IDs back to text.

**Example:**
```php
$text = cllm_vocab_detokenize($vocab, [4, 5, 6, 7]);
// Returns: "the sky is blue"
```

#### `cllm_vocab_stats(resource $vocab): array`

Get vocabulary statistics.

**Returns:** Array with size, capacity, total_tokens, special token IDs

**Example:**
```php
$stats = cllm_vocab_stats($vocab);
echo "Size: {$stats['size']}\n";
```

#### `cllm_vocab_save(resource $vocab, string $filename): bool`

Save vocabulary to file.

#### `cllm_vocab_load(string $filename): resource`

Load vocabulary from file.

### Training Functions

#### `cllm_training_init(resource $model, array $config): resource`

Initialize training for a model.

**Parameters:**
- `$config`: Training configuration
  - `learning_rate`: Learning rate (default: 0.001)
  - `batch_size`: Batch size (default: 32)
  - `num_epochs`: Number of epochs (default: 10)
  - `sequence_length`: Sequence length (default: 128)

**Example:**
```php
$training = cllm_training_init($model, [
    'learning_rate' => 0.001,
    'batch_size' => 4,
    'num_epochs' => 10
]);
```

### Inference Functions

#### `cllm_generate(resource $model, string $prompt, array $options = []): string`

Generate text from a prompt.

**Parameters:**
- `$prompt`: Input text prompt
- `$options`: Generation options
  - `max_tokens`: Maximum tokens to generate (default: 50)
  - `temperature`: Sampling temperature (default: 0.8)

**Example:**
```php
$text = cllm_generate($model, "The sky is", [
    'max_tokens' => 20,
    'temperature' => 0.7
]);
```

### Math Functions

#### `cllm_prime_nth(int $n): int`

Get the nth prime number.

**Example:**
```php
$prime = cllm_prime_nth(100);  // Returns 541
```

#### `cllm_prime_is_prime(int $number): bool`

Check if a number is prime.

**Example:**
```php
$is_prime = cllm_prime_is_prime(17);  // Returns true
```

#### `cllm_math_exp(float $x): float`

Calculate e^x.

#### `cllm_math_log(float $x): float`

Calculate natural logarithm.

#### `cllm_math_sin(float $x): float`

Calculate sine.

#### `cllm_math_cos(float $x): float`

Calculate cosine.

### Utility Functions

#### `cllm_version(): string`

Get CLLM extension version.

## Constants

### Platonic Solid Types

- `CLLM_PLATONIC_TETRAHEDRON` - 4 vertices, 6 edges, 4 faces
- `CLLM_PLATONIC_CUBE` - 8 vertices, 12 edges, 6 faces
- `CLLM_PLATONIC_OCTAHEDRON` - 6 vertices, 12 edges, 8 faces
- `CLLM_PLATONIC_DODECAHEDRON` - 20 vertices, 30 edges, 12 faces
- `CLLM_PLATONIC_ICOSAHEDRON` - 12 vertices, 30 edges, 20 faces

## Complete Example

```php
<?php
// Create model
$model = cllm_create_model(CLLM_PLATONIC_CUBE, 1000, [
    'embedding_dim' => 64,
    'num_layers' => 2
]);

// Create and build vocabulary
$vocab = cllm_vocab_create(5000);
cllm_vocab_build_from_file($vocab, 'training_data.txt');

// Tokenize text
$text = "The sky is blue";
$tokens = cllm_vocab_tokenize($vocab, $text);
echo "Tokens: " . implode(', ', $tokens) . "\n";

// Detokenize
$decoded = cllm_vocab_detokenize($vocab, $tokens);
echo "Decoded: $decoded\n";

// Initialize training
$training = cllm_training_init($model, [
    'learning_rate' => 0.001,
    'batch_size' => 4,
    'num_epochs' => 10
]);

// Generate text
$generated = cllm_generate($model, "The sky is", [
    'max_tokens' => 20,
    'temperature' => 0.8
]);
echo "Generated: $generated\n";

// Save model
cllm_save_model($model, 'my_model.cllm');

// Save vocabulary
cllm_vocab_save($vocab, 'my_vocab.vocab');
?>
```

## REST API

### Starting the Server

```bash
cd php
php -S localhost:8080 rest_api.php
```

### API Endpoints

#### Health Check
```bash
curl http://localhost:8080/api/health
```

#### Create Model
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

#### Create Vocabulary
```bash
curl -X POST http://localhost:8080/api/vocab/create \
  -H "Content-Type: application/json" \
  -d '{"capacity": 5000}'
```

#### Build Vocabulary
```bash
curl -X POST http://localhost:8080/api/vocab/build \
  -H "Content-Type: application/json" \
  -d '{
    "vocab_id": "vocab_xxx",
    "text": "The sky is blue. Prime numbers are important."
  }'
```

#### Tokenize Text
```bash
curl -X POST http://localhost:8080/api/vocab/tokenize \
  -H "Content-Type: application/json" \
  -d '{
    "vocab_id": "vocab_xxx",
    "text": "The sky is blue"
  }'
```

#### Generate Text
```bash
curl -X POST http://localhost:8080/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "model_xxx",
    "prompt": "The sky is",
    "options": {
      "max_tokens": 20,
      "temperature": 0.8
    }
  }'
```

#### Get Prime Number
```bash
curl http://localhost:8080/api/math/prime/100
```

#### Check if Prime
```bash
curl http://localhost:8080/api/math/isprime/17
```

### Testing the API

Run the comprehensive test suite:
```bash
php test_api.php
```

## Demo Scripts

### Basic Demo
```bash
php demo.php
```

Demonstrates all core functionality with examples.

### API Test
```bash
# Start server in one terminal
php -S localhost:8080 rest_api.php

# Run tests in another terminal
php test_api.php
```

## Architecture

The PHP extension provides a thin wrapper around the C CLLM library:

```
PHP Script
    ↓
PHP Extension (cllm_extension.c)
    ↓
CLLM C Library (libcllm.so)
    ↓
Math Library (libcrystallinemath.so)
    ↓
Algorithms Library (libalgorithms.so)
```

## Performance

- **Model Creation**: < 1 second
- **Vocabulary Building**: ~10,000 tokens/second
- **Tokenization**: ~100,000 tokens/second
- **Inference**: ~1,000 tokens/second

## Error Handling

All functions return `false` on error and emit PHP warnings. Check return values:

```php
$model = cllm_create_model(CLLM_PLATONIC_CUBE, 1000);
if (!$model) {
    die("Failed to create model\n");
}
```

## Memory Management

Resources are automatically freed when they go out of scope. Manual cleanup:

```php
cllm_free_model($model);
```

## Thread Safety

The CLLM library uses thread-safe operations. The PHP extension is safe for use in multi-threaded environments.

## Troubleshooting

### Extension Not Loading

Check PHP error log:
```bash
tail -f /var/log/php_errors.log
```

Verify shared libraries:
```bash
ldd /path/to/cllm.so
```

### Segmentation Faults

Enable core dumps:
```bash
ulimit -c unlimited
```

Run with debugging:
```bash
php -d display_errors=1 -d error_reporting=E_ALL demo.php
```

## License

Same as CLLM project license.

## Support

For issues and questions, see the main CLLM repository.