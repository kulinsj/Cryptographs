//var baseurl = 'http://cryptographs.herokuapp.com';
var baseurl = 'http://localhost:2500';
$.get(baseurl+'/WDC', function(data, status){
    $('#body').html(data);
});

$.get(baseurl+'/helloData', function(data, status){
    console.log(data);
});