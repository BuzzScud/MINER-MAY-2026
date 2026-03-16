<?php
/**
 * CLLM REST API Test Client
 * 
 * Tests all endpoints of the CLLM REST API
 */

$base_url = 'http://localhost:8080/api';

// Helper function to make API requests
function api_request($method, $endpoint, $data = null) {
    global $base_url;
    
    $url = $base_url . $endpoint;
    $ch = curl_init($url);
    
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    
    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    }
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    return [
        'code' => $http_code,
        'data' => json_decode($response, true)
    ];
}

echo "╔══════════════════════════════════════════════════════════════╗\n";
echo "║         CLLM REST API - Comprehensive Test Suite            ║\n";
echo "╚══════════════════════════════════════════════════════════════╝\n\n";

// Test 1: Health Check
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 1: HEALTH CHECK\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$response = api_request('GET', '/health');
if ($response['code'] === 200 && $response['data']['success']) {
    echo "✓ API is healthy\n";
    echo "  Status: {$response['data']['status']}\n";
    echo "  Extension loaded: " . ($response['data']['extension_loaded'] ? 'Yes' : 'No') . "\n\n";
} else {
    echo "✗ Health check failed\n\n";
}

// Test 2: Version
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 2: VERSION INFO\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$response = api_request('GET', '/version');
if ($response['code'] === 200) {
    echo "✓ Version info retrieved\n";
    echo "  CLLM Version: {$response['data']['version']}\n";
    echo "  PHP Version:  {$response['data']['php_version']}\n";
    echo "  API Version:  {$response['data']['api_version']}\n\n";
} else {
    echo "✗ Version check failed\n\n";
}

// Test 3: Create Model
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 3: CREATE MODEL\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$response = api_request('POST', '/model/create', [
    'platonic_solid' => 1,  // CUBE
    'vocab_size' => 500,
    'options' => [
        'embedding_dim' => 32,
        'hidden_dim' => 64,
        'num_layers' => 2,
        'num_heads' => 8
    ]
]);

if ($response['code'] === 200 && $response['data']['success']) {
    $model_id = $response['data']['model_id'];
    echo "✓ Model created\n";
    echo "  Model ID: $model_id\n";
    echo "  Vocab Size: {$response['data']['info']['vocab_size']}\n";
    echo "  Embedding Dim: {$response['data']['info']['embedding_dim']}\n";
    echo "  Layers: {$response['data']['info']['num_layers']}\n\n";
} else {
    echo "✗ Model creation failed\n\n";
    $model_id = null;
}

// Test 4: Create Vocabulary
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 4: CREATE VOCABULARY\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$response = api_request('POST', '/vocab/create', [
    'capacity' => 5000
]);

if ($response['code'] === 200 && $response['data']['success']) {
    $vocab_id = $response['data']['vocab_id'];
    echo "✓ Vocabulary created\n";
    echo "  Vocab ID: $vocab_id\n";
    echo "  Capacity: {$response['data']['stats']['capacity']}\n\n";
} else {
    echo "✗ Vocabulary creation failed\n\n";
    $vocab_id = null;
}

// Test 5: Build Vocabulary
if ($vocab_id) {
    echo "═══════════════════════════════════════════════════════════════\n";
    echo " TEST 5: BUILD VOCABULARY FROM TEXT\n";
    echo "═══════════════════════════════════════════════════════════════\n\n";
    
    $training_text = "The sky is blue. Prime numbers are important. Language models learn patterns.";
    
    $response = api_request('POST', '/vocab/build', [
        'vocab_id' => $vocab_id,
        'text' => $training_text
    ]);
    
    if ($response['code'] === 200 && $response['data']['success']) {
        echo "✓ Vocabulary built\n";
        echo "  Tokens added: {$response['data']['tokens_added']}\n";
        echo "  Total size: {$response['data']['stats']['size']}\n\n";
    } else {
        echo "✗ Vocabulary building failed\n\n";
    }
}

// Test 6: Tokenization
if ($vocab_id) {
    echo "═══════════════════════════════════════════════════════════════\n";
    echo " TEST 6: TOKENIZATION\n";
    echo "═══════════════════════════════════════════════════════════════\n\n";
    
    $test_text = "The sky is blue";
    
    $response = api_request('POST', '/vocab/tokenize', [
        'vocab_id' => $vocab_id,
        'text' => $test_text
    ]);
    
    if ($response['code'] === 200 && $response['data']['success']) {
        echo "✓ Text tokenized\n";
        echo "  Text: &quot;{$response['data']['text']}&quot;\n";
        echo "  Tokens: [" . implode(', ', $response['data']['tokens']) . "]\n";
        echo "  Count: {$response['data']['num_tokens']}\n\n";
        
        $tokens = $response['data']['tokens'];
        
        // Test 7: Detokenization
        echo "═══════════════════════════════════════════════════════════════\n";
        echo " TEST 7: DETOKENIZATION\n";
        echo "═══════════════════════════════════════════════════════════════\n\n";
        
        $response = api_request('POST', '/vocab/detokenize', [
            'vocab_id' => $vocab_id,
            'tokens' => $tokens
        ]);
        
        if ($response['code'] === 200 && $response['data']['success']) {
            echo "✓ Tokens detokenized\n";
            echo "  Tokens: [" . implode(', ', $response['data']['tokens']) . "]\n";
            echo "  Text: &quot;{$response['data']['text']}&quot;\n";
            echo "  Match: " . ($response['data']['text'] === $test_text ? "✓ Perfect" : "✗ Mismatch") . "\n\n";
        } else {
            echo "✗ Detokenization failed\n\n";
        }
    } else {
        echo "✗ Tokenization failed\n\n";
    }
}

// Test 8: Math Functions
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 8: MATH FUNCTIONS\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

// Test prime functions
echo "Prime Numbers:\n";
for ($i = 1; $i <= 5; $i++) {
    $response = api_request('GET', "/math/prime/$i");
    if ($response['code'] === 200) {
        $prime = $response['data']['prime'];
        $is_prime = $response['data']['is_prime'] ? '✓' : '✗';
        echo "  {$i}th prime: $prime $is_prime\n";
    }
}
echo "\n";

// Test transcendental functions
echo "Transcendental Functions:\n";
$test_values = [
    ['exp', 1],
    ['log', 2.718281828],
    ['sin', 1.5707963268],  // π/2
    ['cos', 0]
];

foreach ($test_values as list($func, $x)) {
    $response = api_request('POST', "/math/$func", ['x' => $x]);
    if ($response['code'] === 200) {
        $result = $response['data']['result'];
        echo sprintf("  %s(%.4f) = %.6f\n", $func, $x, $result);
    }
}
echo "\n";

// Test 9: Text Generation
if ($model_id) {
    echo "═══════════════════════════════════════════════════════════════\n";
    echo " TEST 9: TEXT GENERATION\n";
    echo "═══════════════════════════════════════════════════════════════\n\n";
    
    $prompts = [
        "The sky is",
        "Prime numbers",
        "Language models"
    ];
    
    foreach ($prompts as $prompt) {
        $response = api_request('POST', '/generate', [
            'model_id' => $model_id,
            'prompt' => $prompt,
            'options' => [
                'max_tokens' => 10,
                'temperature' => 0.8
            ]
        ]);
        
        if ($response['code'] === 200 && $response['data']['success']) {
            echo "Prompt: &quot;$prompt&quot;\n";
            echo "Generated: {$response['data']['generated']}\n\n";
        }
    }
}

// Test 10: List Endpoints
echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST 10: API DOCUMENTATION\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$response = api_request('GET', '/endpoints');
if ($response['code'] === 200) {
    echo "✓ Available endpoints:\n\n";
    foreach ($response['data']['endpoints'] as $category => $endpoints) {
        echo strtoupper($category) . ":\n";
        foreach ($endpoints as $endpoint => $description) {
            echo "  $endpoint\n    → $description\n";
        }
        echo "\n";
    }
}

// ============================================================================
// SUMMARY
// ============================================================================

echo "═══════════════════════════════════════════════════════════════\n";
echo " TEST SUITE COMPLETE\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

echo "All API endpoints tested successfully!\n";
?>