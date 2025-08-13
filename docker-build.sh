#!/bin/bash

# Docker build script for Albieri Backend
# This script builds the Docker image and provides options for deployment

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
IMAGE_NAME="albieri"
TAG="latest"
BUILD_ARGS=""
PUSH_TO_REGISTRY=false
REGISTRY=""
PLATFORM="linux/amd64"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --name NAME         Docker image name (default: albieri-backend)"
    echo "  -t, --tag TAG           Docker image tag (default: latest)"
    echo "  -p, --platform PLATFORM Target platform (default: linux/amd64)"
    echo "  -r, --registry REGISTRY Registry to push to (e.g., docker.io/username)"
    echo "  --push                  Push image to registry after build"
    echo "  --no-cache              Build without using cache"
    echo "  --build-arg ARG=VALUE   Pass build argument to Docker build"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                          # Basic build"
    echo "  $0 --tag v1.0.0                           # Build with specific tag"
    echo "  $0 --registry myregistry.com/myapp --push # Build and push to registry"
    echo "  $0 --no-cache --tag latest                # Build without cache"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        --push)
            PUSH_TO_REGISTRY=true
            shift
            ;;
        --no-cache)
            BUILD_ARGS="$BUILD_ARGS --no-cache"
            shift
            ;;
        --build-arg)
            BUILD_ARGS="$BUILD_ARGS --build-arg $2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Set full image name with registry if provided
if [[ -n "$REGISTRY" ]]; then
    FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:$TAG"
else
    FULL_IMAGE_NAME="$IMAGE_NAME:$TAG"
fi

print_info "Starting Docker build process..."
print_info "Image name: $FULL_IMAGE_NAME"
print_info "Platform: $PLATFORM"

# Check if Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    print_error "Dockerfile not found in current directory!"
    exit 1
fi

# Check if package.json exists
if [[ ! -f "package.json" ]]; then
    print_error "package.json not found in current directory!"
    exit 1
fi

# Check if we're in the right directory
if [[ ! -d "src" ]] || [[ ! -f "auth.ts" ]]; then
    print_warning "Make sure you're running this script from the backend directory"
    print_warning "Expected files: src/, auth.ts, package.json, Dockerfile"
fi

# Build the Docker image
print_info "Building Docker image..."
docker build \
    --platform $PLATFORM \
    --tag $FULL_IMAGE_NAME \
    $BUILD_ARGS \
    .

if [[ $? -eq 0 ]]; then
    print_success "Docker image built successfully: $FULL_IMAGE_NAME"
else
    print_error "Docker build failed!"
    exit 1
fi

# Show image size
IMAGE_SIZE=$(docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "$FULL_IMAGE_NAME" | awk '{print $2}')
if [[ -n "$IMAGE_SIZE" ]]; then
    print_info "Image size: $IMAGE_SIZE"
fi

# Push to registry if requested
if [[ "$PUSH_TO_REGISTRY" == true ]]; then
    if [[ -z "$REGISTRY" ]]; then
        print_error "Registry not specified. Use -r/--registry option to specify registry."
        exit 1
    fi

    print_info "Pushing image to registry: $REGISTRY"
    docker push $FULL_IMAGE_NAME

    if [[ $? -eq 0 ]]; then
        print_success "Image pushed successfully to $REGISTRY"
    else
        print_error "Failed to push image to registry!"
        exit 1
    fi
fi

# Show final summary
echo ""
print_success "Build process completed!"
echo "Image: $FULL_IMAGE_NAME"
echo ""
echo "To run the container:"
echo "  docker run -d -p 8080:8080 --name albieri-backend $FULL_IMAGE_NAME"
echo ""
echo "To run with docker-compose:"
echo "  docker-compose -f docker-compose.prod.yaml up -d"
echo ""
echo "Don't forget to:"
echo "  1. Create .env.production with your environment variables"
echo "  2. Ensure your database and Redis are accessible"
echo "  3. Configure your reverse proxy (if using one)"
