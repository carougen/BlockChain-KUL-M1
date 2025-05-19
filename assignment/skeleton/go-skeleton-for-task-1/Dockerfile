# Start with the official Golang image
FROM golang:1.23

# Set the Current Working Directory inside the container
WORKDIR /app

# Copy the Go Modules manifests
COPY go.mod go.sum ./

# Download all dependencies. Dependencies will be cached if the go.mod and go.sum are not changed
RUN go mod tidy

# Copy the entire project to the working directory inside the container
COPY . .

# Build the Go app
RUN go build -o main ./cmd

# Expose port 18018 for the application (you can change the port if needed)
EXPOSE 18018

# Command to run the executable
CMD ["./main"]
