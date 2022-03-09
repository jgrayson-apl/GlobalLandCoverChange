/*
 Copyright 2020 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.​
 */

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/dom-construct",
  "esri/request",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/Color",
  "esri/Graphic",
  "esri/layers/GraphicsLayer",
  "esri/layers/support/MosaicRule",
  "esri/layers/support/RasterFunction",
  "esri/geometry/Polygon",
  "esri/geometry/geometryEngine",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/Legend",
  "esri/widgets/TimeSlider",
  "esri/widgets/Swipe",
  "esri/widgets/Expand"
], function (calcite, declare, ApplicationBase,
             i18n, itemUtils, domHelper, domConstruct,
             esriRequest, IdentityManager, Evented, watchUtils, promiseUtils,
             Portal, Color, Graphic, GraphicsLayer, MosaicRule, RasterFunction,
             Polygon, geometryEngine, Home, Search, Legend, TimeSlider, Swipe, Expand) {

  return declare([Evented], {

    /**
     *
     */
    constructor: function () {
      // BASE //
      this.base = null;
      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function (base) {
      if (!base) {
        console.error("ApplicationBase is not defined");
        return;
      }
      this.base = base;

      const webMapItems = this.base.results.webMapItems;
      const webSceneItems = this.base.results.webSceneItems;
      const validItems = webMapItems.concat(webSceneItems)
      const firstItem = (validItems && validItems.length) ? validItems[0].value : null;
      if (!firstItem) {
        console.error("Could not load an item to display");
        return;
      }

      // TITLE //
      this.base.config.title = (this.base.config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(this.base.config.title);
      document.getElementById("app-title-node").innerHTML = this.base.config.title;
      document.getElementById("app-title-label").innerHTML = this.base.config.title;

      const viewProperties = itemUtils.getConfigViewProperties(this.base.config);
      viewProperties.container = "view-container";
      viewProperties.constraints = {snapToZoom: false};

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({item: firstItem, appProxies: appProxies}).then(map => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then(view => {
          view.when(() => {
            this.viewReady(firstItem, view).then(() => {
              view.container.classList.remove("loading");
            });
          });
        });
      });
    },

    /**
     *
     * @param item
     * @param view
     */
    viewReady: function (item, view) {

      // LOADING //
      const updating_node = domConstruct.create("div", {className: "view-loading-node loader"});
      domConstruct.create("div", {className: "loader-bars"}, updating_node);
      domConstruct.create("div", {className: "loader-text font-size--3 text-white", innerHTML: "Updating..."}, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        updating_node.classList.toggle("is-active", updating);
      });

      // USER SIGN IN //
      // return this.initializeUserSignIn().catch(console.warn).then(() => {

      // STARTUP DIALOG //
      this.initializeStartupDialog();

      // POPUP DOCKING OPTIONS //
      view.popup.dockEnabled = true;
      view.popup.dockOptions = {
        buttonEnabled: false,
        breakpoint: false,
        position: "top-center"
      };

      // SEARCH //
      const search = new Search({view: view, searchTerm: this.base.config.search || ""});
      const searchExpand = new Expand({
        view: view,
        content: search,
        expanded: true,
        expandIconClass: "esri-icon-search",
        expandTooltip: "Search"
      });
      view.ui.add(searchExpand, {position: "top-left", index: 0});

      // HOME //
      const home = new Home({view: view});
      view.ui.add(home, {position: "top-left", index: 1});

      // APPLICATION READY //
      this.applicationReady(view);

      return promiseUtils.resolve();
      // });

    },

    /**
     *
     */
    initializeStartupDialog: function () {

      // STARTUP DIALOG //
      const showStartup = localStorage.getItem('show-startup') || 'show';
      if (showStartup === 'show') {
        calcite.bus.emit('modal:open', {id: 'app-details-dialog'});
      }

      // HIDE STARTUP DIALOG //
      const hideStartupInput = document.getElementById('hide-startup-input');
      hideStartupInput.checked = (showStartup === 'hide');
      hideStartupInput.addEventListener('change', () => {
        localStorage.setItem('show-startup', hideStartupInput.checked ? 'hide' : 'show');
      });

    },

    /**
     * APPLICATION READY
     *
     * @param view
     */
    applicationReady: function (view) {

      const landcoverStartLayer = view.map.layers.find(layer => { return (layer.title === "Global Land Cover 1992-2018 - Start"); });
      landcoverStartLayer.load().then(() => {
        landcoverStartLayer.mosaicRule = null;
        landcoverStartLayer.useViewTime = false;
        //landcoverStartLayer.blendMode = 'multiply';


        const landcoverEndLayer = view.map.layers.find(layer => { return (layer.title === "Global Land Cover 1992-2018 - End"); });
        landcoverEndLayer.load().then(() => {
          landcoverEndLayer.mosaicRule = null;
          landcoverEndLayer.useViewTime = false;
          //landcoverEndLayer.blendMode = 'multiply';

          const swipe = new Swipe({
            view: view,
            leadingLayers: [landcoverStartLayer],
            trailingLayers: [landcoverEndLayer],
            direction: "horizontal",
            position: 50
          });
          view.ui.add(swipe);

          watchUtils.whenEqualOnce(swipe.viewModel, "state", "ready").then(() => {
            setTimeout(() => {

              // GET SWIPE CONTAINER //
              const container = document.querySelector(".esri-swipe__container");
              // INITIAL START AND END YEARS //
              const startYear = this.timeSlider.timeExtent.start.getUTCFullYear();
              const endYear = this.timeSlider.timeExtent.end.getUTCFullYear();
              // ADD SWIPE LABEL //
              const swipeLabel = domConstruct.create("div", {className: "swipe-label panel-dark animate-fade-in"}, container, "after");
              const leadingLabel = domConstruct.create("div", {className: "font-size-3", innerHTML: startYear}, swipeLabel);
              const trailingLabel = domConstruct.create("div", {className: "font-size-3", innerHTML: endYear}, swipeLabel);

              // UPDATE POSITION //
              watchUtils.init(swipe, "position", position => {
                swipeLabel.style.left = `calc(${ position }% - 80px)`;
              });

              // UPDATE LABELS //
              this.on("time-extent-change", timeExtent => {
                leadingLabel.innerHTML = timeExtent.start.getUTCFullYear();
                trailingLabel.innerHTML = timeExtent.end.getUTCFullYear();
              });

            }, 1000);
          });

        });

        this.getPixelSizeMeters = (geometry, factor) => {
          const widthMeters = Math.min(geometry.extent.width, landcoverStartLayer.fullExtent.width);
          return (widthMeters / view.width) * (factor || 1.0);
        };

        view.whenLayerView(landcoverStartLayer).then(nlcdLayerView => {

          // CHANGE RENDERER //
          this.initializeRenderers(view, [landcoverStartLayer, landcoverEndLayer]);

          // OVERVIEW //
          //this.initializeOverview(view);

          // TIME SLIDER //
          this.initializeTimeSlider(view, landcoverStartLayer);

          // LAND COVER CLASS HISTOGRAM //
          this.initializeHistogram(view, landcoverStartLayer);

          // GET RASTER INFO //
          landcoverStartLayer.generateRasterInfo(landcoverStartLayer.renderingRule).then(rasterInfo => {

            // LAND COVER CLASS INFO BY LAND COVER CLASS VALUE //
            const rasterFeatures = rasterInfo.attributeTable.features;
            const createDefaultClassInfos = () => {
              return rasterFeatures.reduce((byValue, rasterFeature) => {
                return byValue.set(rasterFeature.attributes.Value, {...rasterFeature.attributes});
              }, new Map());
            };

            // ACRES BY LAND COVER CLASS CHART //
            this.initializeClassChart(view); //createDefaultClassInfos(), this.getPixelSizeMeters(view.extent)

            // LOCATION INFO //
            this.initializeLocationInfo(view, landcoverStartLayer, createDefaultClassInfos()).then(() => {
              view.container.style.cursor = "crosshair";

              const locationGraphic = new Graphic({
                symbol: {
                  type: "web-style",
                  name: "esri-pin-2",
                  styleName: "Esri2DPointSymbolsStyle"
                }
              });
              const locationLayer = new GraphicsLayer({title: "Location Layer", graphics: [locationGraphic]});
              view.map.add(locationLayer);

              const locationPanel = document.getElementById('location-panel');
              view.ui.add(locationPanel, 'top-right');
              locationPanel.classList.remove('hide');

              const coordsNode = document.getElementById("location-coords-node");
              const locationInfoPanel = document.getElementById("location-info-panel");
              const locationClearBtn = document.getElementById("location-clear");
              locationClearBtn.addEventListener("click", () => {
                this.getLocationInfo();
                locationClearBtn.classList.add("btn-disabled");
                domConstruct.empty(locationInfoPanel);
                locationGraphic.geometry = null;
                coordsNode.innerHTML = "lon:&nbsp;&plusmn;---.----&nbsp;&nbsp;lat:&nbsp;&plusmn;--.----";
              });

              // VIEW CLICK EVENT //
              view.on("click", clickEvt => {
                locationGraphic.geometry = clickEvt.mapPoint;

                this.getLocationInfo(clickEvt.mapPoint).then(locationInfos => {

                  locationClearBtn.classList.remove("btn-disabled");
                  domConstruct.empty(locationInfoPanel);
                  coordsNode.innerHTML = `lon:&nbsp;${ clickEvt.mapPoint.longitude.toFixed(4) }&nbsp;&nbsp;lat:&nbsp;${ clickEvt.mapPoint.latitude.toFixed(4) }`;

                  locationInfos.groupedByYearsInfos.forEach(locationInfo => {
                    domConstruct.create("div", {
                      style: `border-left-color:${ locationInfo.color.toHex() };`,
                      className: "location-info font-size--3",
                      innerHTML: `<span class="avenir-demi">${ locationInfo.startYear } to ${ locationInfo.endYear }:</span> ${ locationInfo.landCover }`
                    }, locationInfoPanel);
                  });

                });
              });
            });


            // CONVERT HISTOGRAM INTO CLASS INFOS //
            const histogramToClassInfos = (histogram) => {
              return histogram.counts.reduce((infos, count, countIndex) => {
                if (infos.has(countIndex)) {
                  const classInfo = infos.get(countIndex);
                  classInfo.Count = count;
                  return infos.set(countIndex, classInfo);
                } else {
                  return infos;
                }
              }, createDefaultClassInfos());
            };

            const handleError = error => {
              if (error.name !== "AbortError") {console.error(error)}
            };

            //
            // UPDATE ANALYSIS
            //
            const updateAnalysis = promiseUtils.debounce(() => {

              const startDate = this.timeSlider.timeExtent.start;
              const endDate = this.timeSlider.timeExtent.end;
              const startYear = startDate.getUTCFullYear();
              const endYear = endDate.getUTCFullYear();

              // SET TIME EXTENT FOR EACH LAYER //
              landcoverStartLayer.timeExtent = {start: startDate, end: startDate};
              landcoverEndLayer.timeExtent = {start: endDate, end: endDate};

              // AREA OF INTEREST //
              let aoi = Polygon.fromExtent(view.extent);

              return Promise.all([
                this.getHistogram(aoi, startYear),
                this.getHistogram(aoi, endYear)
              ]).then(histogramResponses => {

                const classInfosByYear = histogramResponses.reduce((infos, histogramResponse) => {
                  if (histogramResponse) {
                    const classInfos = histogramToClassInfos(histogramResponse.histogram);
                    return infos.set(histogramResponse.year, classInfos);
                  } else {
                    console.warn(histogramResponse.error);
                    return infos;
                  }
                }, new Map());

                const startClassInfo = classInfosByYear.get(startYear);
                const endClassInfo = classInfosByYear.get(endYear);

                const changeClassInfo = createDefaultClassInfos();
                changeClassInfo.forEach(classInfo => {
                  const startCount = startClassInfo.get(classInfo.Value).Count;
                  const endCount = endClassInfo.get(classInfo.Value).Count;

                  //const doesNotApply = (startCount === 0) && (endCount === 0);
                  const onlyLoss = (startCount > 0) && (endCount === 0);
                  const onlyGain = (startCount === 0) && (endCount > 0);
                  //console.assert(!doesNotApply, "DOES NOT APPLY: ", classInfo.ClassName, startCount, endCount);
                  console.assert(!onlyLoss, "ONLY LOSS: ", classInfo.ClassName, startCount, endCount);
                  console.assert(!onlyGain, "ONLY GAIN: ", classInfo.ClassName, startCount, endCount);

                  classInfo.StartCount = startCount;
                  classInfo.EndCount = endCount;
                  classInfo.ChangeCount = (endCount - startCount);

                  classInfo.Count = (endCount - startCount);
                  changeClassInfo.set(classInfo.Value, classInfo);
                });

                this.updateClassChart(changeClassInfo, view.resolution);

              }).catch(handleError);
            });

            // VIEW EXTENT CHANGE //
            watchUtils.init(view, "extent", () => {
              watchUtils.whenOnce(view, 'stationary', updateAnalysis).catch(handleError);
            });

            // TIME EXTENT CHANGED //
            this.on("time-extent-change", updateAnalysis);

            // RENDERING CHANGED //
            this.on("rendering-change", updateAnalysis);

            // INITIAL ANALYSIS //
            watchUtils.whenNotOnce(view, 'updating', updateAnalysis);

          });
        });
      });

    },

    /**
     *
     * @param view
     * @param imageryLayer
     */
    initializeTimeSlider: function (view, imageryLayer) {
      //console.info(imageryLayer.title, imageryLayer.timeInfo);

      // FULL TIME EXTENT //
      this.fullTimeExtent = imageryLayer.timeInfo.fullTimeExtent;

      this.timeSlider = new TimeSlider({
        container: "time-slider-node",
        mode: "time-window",
        playRate: 1500,
        fullTimeExtent: this.fullTimeExtent,
        stops: {interval: imageryLayer.timeInfo.interval}
      });

      this.timeSlider.watch("timeExtent", timeExtent => {
        this.emit("time-extent-change", timeExtent);
      });

    },

    /**
     *
     * @param view
     * @param imageryLayer
     */
    initializeHistogram: function (view, imageryLayer) {

      //const analyticRenderer = { rasterFunction: 'Cartographic Renderer' };

      const startField = imageryLayer.timeInfo.startField;
      const endField = imageryLayer.timeInfo.endField;

      this.getCurrentTimeMosaicRule = (year) => {
        return new MosaicRule({
          operation: "first", method: "center",
          where: `DATE '01-01-${ year }' BETWEEN ${ startField } AND ${ endField }`
        });
      };

      this.getHistogram = (geometry, year) => {
        return new Promise((resolve, reject) => {
          imageryLayer.computeHistograms({
            geometry: geometry,
            renderingRule: imageryLayer.renderingRule,
            mosaicRule: this.getCurrentTimeMosaicRule(year),
            pixelSize: {
              x: view.resolution,
              y: view.resolution,
              spatialReference: {
                wkid: view.spatialReference.wkid
              }
            }
          }).then(histogramResults => {
            resolve({histogram: histogramResults.histograms[0], year: year});
          }).catch(reject);
        });
      };

    },

    /**
     *
     * @param view
     * @param imageryLayer
     * @param classInfosByValue
     * @returns {Promise}
     */
    initializeLocationInfo: function (view, imageryLayer, classInfosByValue) {
      return promiseUtils.create((resolve, reject) => {

        const startField = imageryLayer.timeInfo.startField;
        const endField = imageryLayer.timeInfo.endField;

        const primaryItemsMosaicRule = new MosaicRule({
          operation: "first", method: "attribute",
          where: `Category = 1`
        });

        const noDataClass = {ClassName: "No Data Available", Red: 192, Green: 192, Blue: 192};

        this.getLocationInfo = promiseUtils.debounce(location => {
          return promiseUtils.create((getLocationResolve, getLocationReject) => {
            if (location) {

              imageryLayer.identify({
                geometry: location,
                mosaicRule: primaryItemsMosaicRule,
                timeExtent: imageryLayer.timeInfo.fullTimeExtent,
                returnGeometry: false,
                returnPixelValues: true,
                returnCatalogItems: true
              }).then((identifyResult) => {

                // CLASS VALUES //
                const classValues = identifyResult.properties.Values;
                // CLASS INFOS //
                const classInfos = identifyResult.catalogItems.features.map((feature, featureIdx) => {

                  const classValue = classValues[featureIdx];
                  const classInfo = (classValue !== "NoData") ? classInfosByValue.get(Number(classValue)) : noDataClass;

                  return {
                    productName: feature.attributes.ProductName, //.replace(/ESA_CCI_Land_Cover_/, "..."),
                    startYear: (new Date(feature.attributes[startField])).getUTCFullYear(),
                    endYear: (new Date(feature.attributes[endField])).getUTCFullYear(),
                    landCover: classInfo.ClassName,
                    color: new Color([classInfo.Red, classInfo.Green, classInfo.Blue])
                  };

                });
                // CLASS INFOS SORTED BY YEAR //
                classInfos.sort((a, b) => {
                  if (a.startYear === b.startYear) {
                    return (a.endYear - b.endYear);
                  } else {
                    return (a.startYear - b.startYear);
                  }
                });

                const allYearsInfos = classInfos.map(classInfo => {
                  return `${ classInfo.startYear } to ${ classInfo.endYear }: ${ classInfo.landCover }`;
                });

                // CONFLATE BY START & END YEARS //
                const groupedByYearsInfos = classInfos.reduce((infos, classInfo, classInfoIdx) => {
                  if (classInfoIdx === 0) {
                    infos.push(classInfo);
                  } else {
                    const lastInfo = infos[infos.length - 1];
                    if ((classInfo.landCover === lastInfo.landCover) && (classInfo.startYear === (lastInfo.endYear + 1))) {
                      lastInfo.endYear = classInfo.endYear;
                    } else {
                      infos.push(classInfo);
                    }
                  }
                  return infos;
                }, []);

                getLocationResolve({groupedByYearsInfos: groupedByYearsInfos, allYearsInfos: allYearsInfos});
              });
            } else {
              getLocationReject();
            }
          });
        });

        resolve();
      });
    },

    /**
     *
     *  https://chartjs-plugin-datalabels.netlify.app/
     *
     * @param view
     */
    initializeClassChart: function (view) {
      return promiseUtils.create((resolve, reject) => {

        const tickFormatter = function (value, index, values) {
          const labelInfo = {label: Math.fround(value).toLocaleString(), unit: ''}
          switch (true) {
            case (Math.abs(value) >= 1000000):
              labelInfo.label = Math.fround(value / 1000000).toLocaleString();
              labelInfo.unit = 'M';
              break;
            case (Math.abs(value) >= 1000):
              labelInfo.label = Math.fround(value / 1000).toLocaleString();
              labelInfo.unit = 'K';
              break;
          }
          return `${ labelInfo.label } ${ labelInfo.unit }`;
        }

        const shortenLongClassName = info => {

          const className = info.label;
          const max = 30;

          if ((className.indexOf(' ') === -1) || (className.length < max)) {
            return className;
          } else {

            const parts = className.split(' ');
            const shortLabel = parts.reduce((label, part) => {
              return ((label.length + part.length) < max) ? `${ label } ${ part }` : label;
            }, '');

            return `${ shortLabel } ...`;
          }
        }

        const splitLongClassName = (tooltipItem, data) => {

          const className = tooltipItem[0].label;
          let max = 24;

          if ((className.indexOf(' ') === -1) || (className.length < max)) {
            return className;
          } else {

            const parts = className.split(' ');
            return parts.reduce((label, part) => {
              if (label.length > max) {
                label = `${ label }\n`;
                max = (label.length + 30);
              }
              return `${ label } ${ part }`;
            }, '');
          }
        }

        const equalizeAxisRange = (xAxes) => {
          if (xAxes.min < 0) {
            const absMax = Math.max(Math.abs(xAxes.min), Math.abs(xAxes.max));
            xAxes.min = -absMax;
            xAxes.max = absMax;
          } else {
            xAxes.min = -xAxes.max;
          }
        };

        const barBorderWidth = (context) => {
          const data = context.dataset.data;
          return data.length ? ((data[context.dataIndex].x > 0) ? {left: 1.0} : {right: 1.0}) : 0.0;
        }

        const calcHorizontalAnchor = (context) => {
          return (context.dataset.data[context.dataIndex].x > 0) ? 'start' : 'end';
        }

        const calcHorizontalAlign = (context) => {
          return (context.dataset.data[context.dataIndex].x > 0) ? 'start' : 'end';
        }

        const tooltipLabelCallback = (tooltipItem, data) => {
          return data.datasets[tooltipItem.datasetIndex].data[tooltipItem.index].tooltip;
        }

        Chart.defaults.global.defaultFontFamily = "'Avenir Next LT Pro'";
        Chart.defaults.global.defaultFontSize = 12;
        Chart.defaults.global.defaultFontColor = '#ededed'; // '#424242';
        Chart.defaults.global.defaultFontStyle = 'normal';

        const chartNode = document.getElementById('chart-node');
        const landcoverChart = new Chart(chartNode, {
          type: 'horizontalBar',
          data: {
            datasets: [
              {
                data: [],
                backgroundColor: [],
                borderColor: '#ffffff', //'#222222',
                borderSkipped: false,
                borderWidth: barBorderWidth,
                datalabels: {
                  formatter: shortenLongClassName,
                  anchor: calcHorizontalAnchor,
                  align: calcHorizontalAlign,
                  clip: false,
                  clamp: true,
                  padding: {top: 2, bottom: 2, left: 0, right: 0},
                  color: '#ffffff', //'#666666',
                  backgroundColor: 'rgba(50,50,50,0.5)', //'rgba(255,255,255,0.5)',
                  font: {size: 10}
                }
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animationDuration: 1000,
            animation: {duration: 0},
            hover: {animationDuration: 0},
            responsiveAnimationDuration: 0,
            title: {
              display: true,
              text: ['Change in Land Cover Area', ' '],
              fontSize: 16,
              fontStyle: 'normal'
            },
            tooltips: {
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#424242',
              titleFontColor: '#424242', //Chart.defaults.global.defaultFontColor,
              titleAlign: 'center',
              titleMarginBottom: 8,
              bodyFontColor: '#424242', //Chart.defaults.global.defaultFontColor,
              callbacks: {
                title: splitLongClassName,
                label: tooltipLabelCallback
              }
            },
            legend: {display: false},
            scales: {
              yAxes: [{display: false}],
              xAxes: [{
                scaleLabel: {
                  display: true,
                  labelString: 'Approximate Change in Acres',
                  fontSize: 13
                },
                afterDataLimits: equalizeAxisRange,
                ticks: {callback: tickFormatter},
                gridLines: {
                  color: '#666666',
                  zeroLineColor: '#ffffff', //'#222222',
                  zeroLineWidth: 2.0
                }
              }]
            }
          }
        });

        const acrePerSqMeter = 0.000247105;
        const cellsToAcre = (pixelSizeMeters) => {
          return (pixelSizeMeters * pixelSizeMeters) * acrePerSqMeter;
        };

        this.updateClassChart = (changeClassInfo, pixelSizeMeters) => {
          //console.info(changeClassInfo);

          const startYear = this.timeSlider.timeExtent.start.getUTCFullYear();
          const endYear = this.timeSlider.timeExtent.end.getUTCFullYear();

          const acresPerPixel = cellsToAcre(pixelSizeMeters)

          const labels = [];
          const data = [];
          const colors = [];
          changeClassInfo.forEach(classInfo => {

            const acres = (classInfo.Count * acresPerPixel);
            const changeMsg = (acres > 0.0) ? 'Gain' : 'Loss';
            const absChange = Math.abs(acres);
            const tooltip = ` ${ changeMsg } of ${ Math.floor(absChange).toLocaleString() } acres`;

            if (absChange > 100.0) {
              labels.push(classInfo.ClassName);
              data.push({x: acres, label: classInfo.ClassName, tooltip: tooltip});
              colors.push(`rgb(${ classInfo.Red },${ classInfo.Green },${ classInfo.Blue })`);
            }
          });

          landcoverChart.options.title.text = [`Change in Land Cover Area`, `${ startYear } to ${ endYear }`];
          landcoverChart.data.labels = labels;
          landcoverChart.data.datasets[0].data = data;
          landcoverChart.data.datasets[0].backgroundColor = colors;
          landcoverChart.update();
        };

      });
    },

    /**
     *
     * @param view
     * @param imageryLayers
     */
    initializeRenderers: function (view, imageryLayers) {

      const labelByRendererName = new Map();
      labelByRendererName.set('Cartographic Renderer', 'All major land classes');
      labelByRendererName.set('Forested Lands', 'Forested lands');
      labelByRendererName.set('Urban Lands', 'Urban lands');
      labelByRendererName.set('Converted Lands', 'Human-modified lands');
      labelByRendererName.set('Simplified Renderer', 'ESA CCI Reclassified');

      watchUtils.whenDefinedOnce(imageryLayers[0], "rasterFunctionInfos", rasterFunctionInfos => {

        const rendererMenu = document.getElementById('renderer-menu');
        const rendererLabel = document.getElementById('renderer-label');

        // name, description //
        const menuItems = rasterFunctionInfos.reduce((items, rasterFunctionInfo) => {
          if (rasterFunctionInfo.name !== "None") {

            const menuItemNode = domConstruct.create('div', {
              className: 'renderer-menuitem dropdown-link',
              role: 'menu-item',
              'data-renderer': rasterFunctionInfo.name
            }, rendererMenu);

            domConstruct.create('div', {
              className: 'avenir-demi',
              innerHTML: labelByRendererName.get(rasterFunctionInfo.name)
            }, menuItemNode);

            domConstruct.create('div', {
              className: 'padding-left-half font-size--3 avenir-italic text-dark-gray',
              innerHTML: rasterFunctionInfo.description
            }, menuItemNode);

            items.push(menuItemNode);
          }
          return items;
        }, []);

        // RENDERING RASTER FUNCTION SELECTED //
        const rendererSelected = (menuItem) => {

          rendererMenu.querySelectorAll('.renderer-menuitem.selected').forEach(node => { node.classList.remove('selected'); });
          menuItem.classList.add('selected');

          const renderingRule = rasterFunctionInfos.find(rasterFunctionInfo => {
            return (rasterFunctionInfo.name === menuItem.dataset.renderer);
          });
          rendererLabel.innerHTML = labelByRendererName.get(renderingRule.name);
          rendererLabel.title = renderingRule.description;

          imageryLayers.forEach(imageryLayer => {
            imageryLayer.renderingRule = new RasterFunction({functionName: renderingRule.name});
          });
          this.emit("rendering-change", {});
        }

        rendererMenu.addEventListener("click", clickEvt => {
          rendererSelected(clickEvt.target);
        });
        rendererSelected(menuItems[0]);

      });

    }

  });
});
