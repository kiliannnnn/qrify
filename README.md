# QRify
A simple qr-code generator that comes as a custom HTML component

**<p style="color:red">Do not use versions before 1.1</p>**
<p style="color:orange">I created this package for my astro blog project because I couldn't make the precendent package work in my production environnement</p>

## Attributes
- string (***required***) : The string to traduce
- dot-color (***optionnal***) : Any format handled by HTML such as 'black' or '#000' : default to black
- corner-color (***optionnal***) : Any format handled by HTML such as 'black' or '#000' : default to black
- canvasClass (***optionnal***) : give class to the canvas element generated
- canvasStyle (***optionnal***) : give style to the canvas element generated

## Usage
1. Import the script
```Javascript
import '@kiliannnnn/qrify';
```
2. Use the new tag
```HTML
<qr-code string="https://www.youtube.com/watch?v=dQw4w9WgXcQ&ab_channel=RickAstley" dot-color="#999" corner-color="#999" canvasClass="round-lg" canvasStyle="padding: 10px;"></qr-code>
```

## Do not hesitate to report any issue
[QRify repo](https://github.com/kiliannnnn/qrify)