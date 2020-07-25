const fs = require('fs');

let counties = ["hawaii", "maui", "oahu", "kauai"];
let drange = 11;
for(let height = 0; height < drange; height++) {
    let base_low = height + "ft_slr";
    for(let county of counties) {
        let sourceDir = "./output/";
        let destDir = "C:/Users/Jard/Desktop/wrld/wrld project/Assets/Resources/slr_planes/";
        let refbase = base_low + "/" + county + "/georef.csv";
        let source = sourceDir + refbase;
        let dest = destDir + refbase;

        //console.log(source);

        fs.copyFile(source, dest, (err) => {
            if (err) throw err;
            console.log(source + " copied to " + dest);
        });
    }
    
}
