const geo2svg = require("geo2svg");
const shp = require("shpjs");
const fs = require("fs");
const utm = require("utm");

//geojson lng, lat
//bbox is as geojson standard: [lng_min, lat_min, lng_max, lat_max]
let getBBoxFromGeometry = (geometry) => {
    let bbox = geometry.bbox;
    if(bbox == undefined) {
        bbox = [];
        let outerRingCoords;
        if(geometry.type == "Polygon") {
            //outer ring is first element in coordinates array
            outerRingCoords = geometry.coordinates[0];
        }
        else if(geometry.type == "MultiPolygon") {
            let outerRings = [];
            //get outer rings from each 
            for(let i = 0; i < geometry.coordinates.length; i++) {
                outerRings.push(geometry.coordinates[i][0]);
                outerRingCoords = outerRings.flat();
            }
        }
        else {
            throw new Error("Only Polygon and MultiPolygon coordinate standards implemented");
        }
        let latRange = {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY
        };
        let lngRange = {
            min: Number.POSITIVE_INFINITY,
            max: Number.NEGATIVE_INFINITY
        };
        for(let i = 0; i < outerRingCoords.length; i++) {
            let lng = outerRingCoords[i][0];
            let lat = outerRingCoords[i][1];
            if(lat < latRange.min) {
                latRange.min = lat;
            }
            if(lat > latRange.max) {
                latRange.max = lat;
            }
            if(lng < lngRange.min) {
                lngRange.min = lng;
            }
            if(lng > lngRange.max) {
                lngRange.max = lng;
            }
        }
        bbox = [lngRange.min, latRange.min, lngRange.max, latRange.max];
    }
    return bbox;
};


let getOuterBBox = (bboxes) => {
    let latRange = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY
    };
    let lngRange = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY
    };
    for(let i = 0; i < bboxes.length; i++) {
        let lat = {
            min: bboxes[i][1],
            max: bboxes[i][3]
        };
        let lng = {
            min: bboxes[i][0],
            max: bboxes[i][2]
        };
        if(lat.min < latRange.min) {
            latRange.min = lat.min;
        }
        if(lat.max > latRange.max) {
            latRange.max = lat.max;
        }
        if(lng.min < lngRange.min) {
            lngRange.min = lng.min;
        }
        if(lng.max > lngRange.max) {
            lngRange.max = lng.max;
        }
    }
    return [lngRange.min, latRange.min, lngRange.max, latRange.max];
};

let getGroupBBox = (features) => {
    bboxes = [];
    for(let i = 0; i < features.length; i++) {
        bboxes.push(getBBoxFromGeometry(features[i].geometry));
    }
    return getOuterBBox(bboxes);
};

let convertBBoxesToMeters = (bboxes) => {
    let convertedBBoxes = [];
    for(let i = 0; i < bboxes.length; i++) {
        let bbox = bboxes[i];
        //utm package takes lat lng order
        let ll = [bbox[1], bbox[0]];
        let ur = [bbox[3], bbox[2]];
        let mins = utm.fromLatLon(...ll);
        //need to force to a consistent zone
        let maxs = utm.fromLatLon(...ur, mins.zoneNum);
        //console.log(mins);
        // if(mins.zoneLetter != maxs.zoneLetter || mins.zoneNum != maxs.zoneNum) {
        //     console.log("diff");
        // }
        convertedBBoxes.push([mins.easting, mins.northing, maxs.easting, maxs.northing]);
    }
    
    return convertedBBoxes
};

let offSetBBoxes = (offsetX, offsetY, bboxes) => {
    for(let i = 0; i < bboxes.length; i++) {
        bboxes[i][0] -= offsetX;
        bboxes[i][1] -= offsetY;
        bboxes[i][2] -= offsetX;
        bboxes[i][3] -= offsetY;
    }
};

//!!!actually modifies geometry, make sure to do all ll processing first
let ConvertPolyToM = (geometry) => {
    for(let i = 0; i < geometry.coordinates.length; i++) {
        let ring = geometry.coordinates[i];
        for(let j = 0; j < ring.length; j++) {
            let point = ring[j];
            let converted = utm.fromLatLon(point[1], point[0]);
            point[0] = converted.easting;
            point[1] = converted.northing;
        }
    }
};


let breakPolys = (geojson) => {
    let features = [];
    for(let i = 0; i < geojson.features.length; i++) {
                    
        let feature = geojson.features[i];
        if(feature.geometry.type == "MultiPolygon") {
            for(let poly = 0; poly < feature.geometry.coordinates.length; poly++) {
                polyFeature = {
                    type: "Feature",
                    geometry: {
                        type: "Polygon",
                        coordinates: feature.geometry.coordinates[poly]
                    },
                    properties: feature.properties
                }
                features.push(polyFeature);
            }
        }
        else if(feature.geometry.type == "Polygon") {
            features.push(feature);
        }
        else {
            throw new Error("Only Polygon and MultiPolygon supported");
        }
    }
    geojson.features = features;
}

//only need:
//locally: each shapes width and height in meters, center point in lat, lng
//globally: the camera starting position for each county (lat long)

let countyBBoxes = {
    hawaii: [-156.291504, 18.797118, -154.709473, 20.318872],
    maui: [-157.390137, 20.385825, -155.813599, 21.350781],
    oahu: [-158.378906, 21.148554, -157.546692, 21.774804],
    kauai: [-160.386658, 21.631899, -159.104004, 22.339914]
};

let countyMapInit = {
    hawaii: [-155.0868, 19.7241],
    maui: [-156.6825, 20.8783],
    oahu: [-157.8310, 21,2823],
    kauai: [-159.3711, 21.9811]
};

//can use feature bbox to classify county, should be fully contained in the county bbox
let classifyCounty = (bbox) => {
    //if no county return null
    let county = null;
    let counties = Object.keys(countyBBoxes);
    for(let i = 0; i < counties.length; i++) {
        let current = counties[i];
        let countyBBox = countyBBoxes[current];
        if(bbox[0] > countyBBox[0] && bbox[1] > countyBBox[1] && bbox[2] < countyBBox[2] && bbox[3] < countyBBox[3]) {
            county = current;
            break;
        }
    }
    return county;
}




let writeGlobalPositionalData = (path) => {
    fcontents = "";
    let counties = Object.keys(countyBBoxes);
    for(let i = 0; i < counties.length; i++) {
        let county = counties[i];
        let pos = countyMapInit[county];
        fcontents += county + ",";
        fcontents += pos[0] + ",";
        fcontents += pos[1] + "\n";
    }
    if(!fs.existsSync(path)) {
        fs.mkdirSync(path, {recursive: true});
    }
    fs.writeFile(path + "globalref.csv", fcontents, (e) => {
        if(e) {
            console.log(e);
        }
    });
}

let processData = (shapefile, nameBase, outPath) => {
    fs.readFile(shapefile, (e, data) => {
        if(e) {
            console.log(e);
        }
        else {
            shp(data).then((geojsons) => {
                let options = {
                    size: [32768, 32768],           // size[0] is svg width, size[1] is svg height
                    padding: [0, 0, 0, 0],  // paddingTop, paddingRight, paddingBottom, paddingLeft, respectively
                    output: 'string',           // output type: 'string' | 'element'(only supported in browser)
                    precision: 7,               // svg coordinates precision
                    strokeWidth: '0px',         // stroke width
                    fill: 'black',              // fill color
                    fillOpacity: 1,           // fill opacity
                };
                //console.log(geojson);
    
                let countyBBoxes = {};
                let planeNames = {};
                //console.log(Array.isArray(geojsons));
                //if multiple feature groups in shapefile will be array, just wrap in an array if it's not to keep consistent
                if(!Array.isArray(geojsons)) {
                    geojsons = [geojsons];
                }
                //console.log(geojsons);
                for(let group = 0; group < geojsons.length; group++) {
                    let geojson = geojsons[group];
                    //break multipolygons into polygons
                    //console.log("?");
                    breakPolys(geojson);
                    //console.log("?");
                    
                    for(let i = 0; i < geojson.features.length; i++) {
                    
                        let feature = geojson.features[i];
                        // //console.log(feature.geometry.coordinates);
                        // //convert to multipoly for consistency, then break into individual polys
                        // if(feature.geometry.type == "Polygon") {
                        //     feature.geometry.coordinates = [feature.geometry.coordinates];
                        // }
                        // for(let pn = 0; pn < feature.geometry.coordinates.length; pn++) {
                        //     let geometry = {
                        //         type = "Polygon"
                        //     }
                        // }
                        
                        let bbox = getBBoxFromGeometry(feature.geometry);
                        let county = classifyCounty(bbox);
                        //console.log(county);
                        
                        //console.log(county);
                        if(county != null) {
                            let dir = outPath + county + "/";
                            if(!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, {recursive: true});
                            }
                            
                            if(countyBBoxes[county] == undefined) {
                                countyBBoxes[county] = [];
                                planeNames[county] = [];
                            }
    
                            // if(countyBBoxes[county].length == 161) {
                            //     console.log(feature);
                            // }

                            let name = nameBase + "_" + county + "_" + countyBBoxes[county].length;
                            let fname_out = dir + name + ".svg";
                            
                            countyBBoxes[county].push(bbox);
                            planeNames[county].push(name);

                            //ConvertPolyToM(feature.geometry);
        
                            let svgStr = geo2svg(feature, options);
                            //console.log("?");
                            //console.log(svgStr);
        
                            fs.writeFile(fname_out, svgStr, (e) => {
                                if(e) {
                                    console.log(e);
                                }
                            });
                        }
                        
                    }
                }
                
                console.log(outPath + " svgs writting");
                
    
                let counties = Object.keys(countyBBoxes);
                for(let i = 0; i < counties.length; i++) {
                    let county = counties[i];
                    let bboxes = countyBBoxes[county];
                    let names = planeNames[county];
                    //console.log(bboxes);
                    let convertedBBoxes = convertBBoxesToMeters(bboxes);
                    
                    let fcontents = "";
                    //console.log(convertedBBoxes);
                    let refName = outPath + county + "/georef.csv";
                    
                    //output format: name, width, height, centerLng, centerLat
                    for(let j = 0; j < convertedBBoxes.length; j++) {
                        
                        let bboxLngLat = bboxes[j]
                        let bboxM = convertedBBoxes[j];
                        let name = names[j];
                        let width = bboxM[2] - bboxM[0];
                        if(width < 0) {
                            console.log("!!!");
                            console.log(county);
                            console.log(bboxLngLat);
                            console.log(bboxM);
                            console.log("!!!");
                        }
                        let height = bboxM[3] - bboxM[1];
                        let centerLng = bboxLngLat[0] + ((bboxLngLat[2] - bboxLngLat[0]) / 2.0);
                        let centerLat = bboxLngLat[1] + ((bboxLngLat[3] - bboxLngLat[1]) / 2.0);
                        fcontents += name + ",";
                        fcontents += width + ",";
                        fcontents += height + ",";
                        fcontents += centerLng + ",";
                        fcontents += centerLat + "\n";
                    }
                    fs.writeFile(refName, fcontents, (e) => {
                        if(e) {
                            console.log(e);
                        }
                    });
                }
                console.log(outPath + " reference files writting");
    
                
    
                
            }, (e) => {
                console.log(e);
            });
        }
    });

}

writeGlobalPositionalData("./output/");
let drange = 11;
for(let height = 0; height < drange; height++) {
    let base_low = height + "ft_low";
    let base_slr = height + "ft_slr";
    //processData("./input/" + base_low + ".zip", base_low, "./output/" + base_low + "/");
    //let's just ignore these for now
    processData("./input/" + base_slr + ".zip", base_slr, "./output/" + base_slr + "/");
}
//processData("./test_in/Oahu_0ft.zip", "0ft_slr", "./test_out/Oahu_0ft/");



